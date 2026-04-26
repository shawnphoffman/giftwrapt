import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({
	env: { LOG_LEVEL: 'silent', LOG_PRETTY: false, BETTER_AUTH_SECRET: 'test-secret' },
}))

let mockToggle = false
let mockAiValid = false

vi.mock('@/lib/settings', () => ({
	getAppSettings: () => Promise.resolve({ scrapeAiCleanTitlesEnabled: mockToggle }),
}))

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

vi.mock('@/lib/ai-client', () => ({ createAiModel: () => ({ __mock: true }) }))

let generateTextImpl: () => Promise<{ text: string }> = () => Promise.resolve({ text: 'ACME Widget 2-pack' })

vi.mock('ai', () => ({
	generateText: () => generateTextImpl(),
}))

import type { Database } from '@/db'

import { maybeCleanTitle } from '../clean-title'

const db = {} as Database

beforeEach(() => {
	mockToggle = false
	mockAiValid = false
	generateTextImpl = () => Promise.resolve({ text: 'ACME Widget 2-pack' })
})

afterEach(() => {
	vi.clearAllMocks()
})

describe('maybeCleanTitle: skip conditions', () => {
	it('skips with no_title when result has no title', async () => {
		const result = await maybeCleanTitle(db, { imageUrls: [] })
		expect(result.skipped).toBe('no_title')
	})

	it('skips with toggle_off when the toggle is disabled', async () => {
		mockToggle = false
		mockAiValid = true
		const result = await maybeCleanTitle(db, { title: 'Noisy', imageUrls: [] })
		expect(result.skipped).toBe('toggle_off')
	})

	it('skips with config_invalid when AI is not configured', async () => {
		mockToggle = true
		mockAiValid = false
		const result = await maybeCleanTitle(db, { title: 'Noisy', imageUrls: [] })
		expect(result.skipped).toBe('config_invalid')
	})
})

describe('maybeCleanTitle: cleaning path', () => {
	beforeEach(() => {
		mockToggle = true
		mockAiValid = true
	})

	it('returns the cleaned title from the LLM, trimmed and unquoted', async () => {
		generateTextImpl = () => Promise.resolve({ text: '  "ACME Widget 2-pack"  ' })
		const result = await maybeCleanTitle(db, { title: 'Amazon.com: ACME Widget 2-pack | Free Shipping', imageUrls: [] })
		expect(result.cleaned).toBe('ACME Widget 2-pack')
	})

	it('returns no_title when the LLM responds with empty text', async () => {
		generateTextImpl = () => Promise.resolve({ text: '   ' })
		const result = await maybeCleanTitle(db, { title: 'Noisy', imageUrls: [] })
		expect(result.skipped).toBe('no_title')
	})

	it('returns the error string when generateText throws', async () => {
		generateTextImpl = () => Promise.reject(new Error('LLM down'))
		const result = await maybeCleanTitle(db, { title: 'Noisy', imageUrls: [] })
		expect(result.error).toContain('LLM down')
		expect(result.cleaned).toBeUndefined()
	})
})
