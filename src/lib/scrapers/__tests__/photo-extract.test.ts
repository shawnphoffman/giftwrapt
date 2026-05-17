import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({
	env: {
		LOG_LEVEL: 'silent',
		LOG_PRETTY: false,
		BETTER_AUTH_SECRET: 'test-secret',
	},
}))

let mockAiValid = false

vi.mock('@/lib/ai-config', () => ({
	resolveAiConfig: () =>
		Promise.resolve({
			isValid: mockAiValid,
			providerType: { source: 'env', value: 'openai' },
			baseUrl: { source: 'missing' },
			apiKey: { source: 'env', value: 'test-key' },
			model: { source: 'env', value: 'gpt-4o-mini' },
			maxOutputTokens: { source: 'default', value: 4096 },
		}),
}))

vi.mock('@/lib/ai-client', () => ({
	createAiModel: () => ({ __mock: true }),
}))

let lastGenerateObjectArgs: { system?: string; messages?: unknown } | null = null
let generateObjectImpl: () => Promise<{ object: Record<string, unknown> }> = () =>
	Promise.resolve({
		object: {
			title: 'Sample Widget',
			description: 'A small blue widget',
			imageUrls: [],
		},
	})

vi.mock('ai', () => ({
	generateObject: (args: { system?: string; messages?: unknown }) => {
		lastGenerateObjectArgs = args
		return generateObjectImpl()
	},
}))

vi.mock('@/db', () => ({ db: {} }))

import { extractFromPhoto } from '../photo-extract'
import { ScrapeProviderError } from '../types'

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])

beforeEach(() => {
	mockAiValid = false
	lastGenerateObjectArgs = null
	generateObjectImpl = () =>
		Promise.resolve({
			object: {
				title: 'Sample Widget',
				description: 'A small blue widget',
				imageUrls: [],
			},
		})
})

describe('extractFromPhoto', () => {
	it('throws config_missing when AI is not configured', async () => {
		mockAiValid = false
		await expect(extractFromPhoto({ bytes: PNG_BYTES, mediaType: 'image/png' })).rejects.toMatchObject({
			code: 'config_missing',
		})
	})

	it('passes image + text content parts to the model', async () => {
		mockAiValid = true
		await extractFromPhoto({ bytes: PNG_BYTES, mediaType: 'image/png' })

		expect(lastGenerateObjectArgs).not.toBeNull()
		expect(typeof lastGenerateObjectArgs?.system).toBe('string')
		const messages = lastGenerateObjectArgs?.messages as Array<{ role: string; content: Array<Record<string, unknown>> }>
		expect(messages).toHaveLength(1)
		expect(messages[0].role).toBe('user')
		const parts = messages[0].content
		expect(parts.some(p => p.type === 'text')).toBe(true)
		const imagePart = parts.find(p => p.type === 'image')
		expect(imagePart).toBeDefined()
		expect(imagePart?.image).toBe(PNG_BYTES)
		expect(imagePart?.mediaType).toBe('image/png')
	})

	it('returns the parsed object with imageUrls stripped to empty', async () => {
		mockAiValid = true
		generateObjectImpl = () =>
			Promise.resolve({
				object: {
					title: 'Hallucinated URL Test',
					imageUrls: ['https://evil.example/fake.jpg'],
					siteName: 'Made up',
					finalUrl: 'https://evil.example',
				},
			})

		const { result, ms } = await extractFromPhoto({ bytes: PNG_BYTES, mediaType: 'image/png' })
		expect(result.title).toBe('Hallucinated URL Test')
		expect(result.imageUrls).toEqual([])
		expect(result.siteName).toBeUndefined()
		expect(result.finalUrl).toBeUndefined()
		expect(typeof ms).toBe('number')
		expect(ms).toBeGreaterThanOrEqual(0)
	})

	it('maps AbortError to ScrapeProviderError(timeout)', async () => {
		mockAiValid = true
		generateObjectImpl = () => {
			const err = new Error('aborted')
			err.name = 'AbortError'
			return Promise.reject(err)
		}
		await expect(extractFromPhoto({ bytes: PNG_BYTES, mediaType: 'image/png' })).rejects.toBeInstanceOf(ScrapeProviderError)
		await expect(extractFromPhoto({ bytes: PNG_BYTES, mediaType: 'image/png' })).rejects.toMatchObject({ code: 'timeout' })
	})

	it('maps other errors to ScrapeProviderError(invalid_response)', async () => {
		mockAiValid = true
		generateObjectImpl = () => Promise.reject(new Error('model does not support vision'))
		await expect(extractFromPhoto({ bytes: PNG_BYTES, mediaType: 'image/png' })).rejects.toMatchObject({
			code: 'invalid_response',
		})
	})
})
