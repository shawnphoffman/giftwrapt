// The usage ledger: every model call writes one `ai_usage` row, the
// admin's output cap reaches the provider, and each existing AI feature
// is labelled.

import { makeUser } from '@test/integration/factories'
import { MockLanguageModelV3 } from 'ai/test'
import { eq, inArray } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { db } from '@/db'
import { aiUsage, appSettings, users } from '@/db/schema'

let currentModel: MockLanguageModelV3

vi.mock('@/lib/ai-config', async () => ({
	...(await vi.importActual<Record<string, unknown>>('@/lib/ai-config')),
	resolveAiConfig: () =>
		Promise.resolve({
			isValid: true,
			providerType: { source: 'env', value: 'anthropic' },
			baseUrl: { source: 'missing' },
			apiKey: { source: 'env', value: 'test-key' },
			model: { source: 'env', value: 'claude-haiku-4-5' },
			maxOutputTokens: { source: 'db', value: 777 },
		}),
}))

vi.mock('@/lib/ai-client', () => ({ createAiModel: () => currentModel }))

vi.mock('@/lib/scrapers/safe-fetch', async () => ({
	...(await vi.importActual<Record<string, unknown>>('@/lib/scrapers/safe-fetch')),
	safeFetch: () =>
		Promise.resolve(
			new Response('<html><head><title>Widget</title></head><body><h1>Widget</h1><p>A very good widget for sale.</p></body></html>', {
				status: 200,
				headers: { 'content-type': 'text/html' },
			})
		),
}))

import { _resetAiBudgetCacheForTesting, AiBudgetExceededError, aiGenerateObject, aiGenerateText } from '@/lib/ai-call'
import { getAiUsageSummary, sweepAiUsage } from '@/lib/ai-usage'
import { generateObjectCached } from '@/lib/intelligence/ai-call'
import { extractFromPhoto } from '@/lib/scrapers/photo-extract'
import { maybeCleanTitle } from '@/lib/scrapers/post-passes/clean-title'
import { createAiProvider } from '@/lib/scrapers/providers/ai'
import type { ScrapeContext } from '@/lib/scrapers/types'

type Captured = { maxOutputTokens?: number }

function mockModel(text: string, captured: Captured = {}, opts: { fail?: boolean } = {}): MockLanguageModelV3 {
	return new MockLanguageModelV3({
		modelId: 'claude-haiku-4-5',
		doGenerate: async args => {
			captured.maxOutputTokens = args.maxOutputTokens
			if (opts.fail) throw new Error('provider down')
			return {
				content: [{ type: 'text' as const, text }],
				usage: {
					inputTokens: { total: 1000, noCache: 900, cacheRead: 100, cacheWrite: 0 },
					outputTokens: { total: 200, text: 200, reasoning: 0 },
				},
				finishReason: { unified: 'stop' as const, raw: 'stop' },
				warnings: [],
			}
		},
	})
}

async function setSetting(key: string, value: unknown): Promise<void> {
	await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } })
}

function silentLogger(): ScrapeContext['logger'] {
	const noop = () => {}
	const fn = noop as unknown as ScrapeContext['logger']
	return new Proxy({} as object, { get: (_, p) => (p === 'child' ? () => fn : noop) }) as ScrapeContext['logger']
}

const createdUserIds: Array<string> = []

async function rowsFor(feature: string) {
	return db.select().from(aiUsage).where(eq(aiUsage.feature, feature))
}

describe('AI usage ledger', () => {
	afterEach(async () => {
		await db.delete(aiUsage)
		if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds.splice(0)))
		await setSetting('scrapeAiCleanTitlesEnabled', false)
		await setSetting('aiPhotoExtractEnabled', true)
		await setSetting('aiMonthlyCostCeilingUsd', null)
		_resetAiBudgetCacheForTesting()
	})

	it('records tokens, cost, model, and user for a successful call, and passes the output cap through', async () => {
		const user = await makeUser(db, { name: 'Caller' })
		createdUserIds.push(user.id)
		const captured: Captured = {}
		const result = await aiGenerateObject(
			{ feature: 'admin-test', userId: user.id },
			{
				model: mockModel(JSON.stringify({ answer: 'yes' }), captured),
				schema: z.object({ answer: z.string() }),
				prompt: 'q',
				maxOutputTokens: 321,
			}
		)
		expect(result.object).toEqual({ answer: 'yes' })
		expect(result.usage).toEqual({ inputTokens: 1000, outputTokens: 200, cachedInputTokens: 100 })
		expect(captured.maxOutputTokens).toBe(321)

		const [row] = await rowsFor('admin-test')
		expect(row).toMatchObject({
			model: 'claude-haiku-4-5',
			userId: user.id,
			tokensIn: 1000,
			tokensOut: 200,
			cachedInputTokens: 100,
			outcome: 'ok',
		})
		// Haiku: 900 uncached in at $1/M, 100 cached at a tenth, 200 out at $5/M.
		expect(row.estimatedCostMicroUsd).toBe(1910)
	})

	it('records a failed call and rethrows', async () => {
		await expect(aiGenerateText({ feature: 'admin-test' }, { model: mockModel('', {}, { fail: true }), prompt: 'ping' })).rejects.toThrow()
		const [row] = await rowsFor('admin-test')
		expect(row).toMatchObject({ outcome: 'error', tokensIn: 0, tokensOut: 0, userId: null })
	})

	it('a ledger write failure does not break the call', async () => {
		// A user id that does not exist violates the FK; the call still returns.
		const result = await aiGenerateText({ feature: 'admin-test', userId: 'no-such-user' }, { model: mockModel('pong'), prompt: 'ping' })
		expect(result.text).toBe('pong')
		expect(await rowsFor('admin-test')).toEqual([])
	})

	it('title clean-up, photo extract, the scrape provider, and intelligence each write a labelled row', async () => {
		const user = await makeUser(db, { name: 'Feature User' })
		createdUserIds.push(user.id)

		await setSetting('scrapeAiCleanTitlesEnabled', true)
		const cleanCaptured: Captured = {}
		currentModel = mockModel('Clean Widget', cleanCaptured)
		const cleaned = await maybeCleanTitle(db, { title: 'Amazon.com: Widget (Renewed)', imageUrls: [] }, { userId: user.id })
		expect(cleaned.cleaned).toBe('Clean Widget')
		expect(cleanCaptured.maxOutputTokens).toBe(777)
		expect(await rowsFor('clean-title')).toMatchObject([{ userId: user.id, outcome: 'ok' }])

		const photoCaptured: Captured = {}
		currentModel = mockModel(JSON.stringify({ title: 'Photo Widget', imageUrls: [] }), photoCaptured)
		const photo = await extractFromPhoto({ bytes: new Uint8Array([1, 2, 3]), mediaType: 'image/png', userId: user.id })
		expect(photo.result.title).toBe('Photo Widget')
		expect(photoCaptured.maxOutputTokens).toBe(777)
		expect(await rowsFor('photo-extract')).toMatchObject([{ userId: user.id, outcome: 'ok' }])

		const scrapeCaptured: Captured = {}
		currentModel = mockModel(JSON.stringify({ title: 'Scraped Widget', imageUrls: [] }), scrapeCaptured)
		const provider = createAiProvider({ type: 'ai', id: 'default', name: 'AI extraction', enabled: true, tier: 3 })
		const response = await provider.fetch({
			url: 'https://shop.example.com/widget',
			signal: new AbortController().signal,
			logger: silentLogger(),
			perAttemptTimeoutMs: 5000,
		})
		expect(response.kind).toBe('structured')
		expect(scrapeCaptured.maxOutputTokens).toBe(777)
		expect(await rowsFor('scrape-provider')).toMatchObject([{ userId: null, outcome: 'ok' }])

		// Intelligence deliberately sends no output cap (see intelligence/ai-call.ts).
		const intelCaptured: Captured = {}
		await generateObjectCached({
			model: mockModel(JSON.stringify({ answer: 'ok' }), intelCaptured),
			schema: z.object({ answer: z.string() }),
			system: 'sys',
			prompt: 'p',
			userId: user.id,
		})
		expect(intelCaptured.maxOutputTokens).toBeUndefined()
		expect(await rowsFor('intelligence')).toMatchObject([{ userId: user.id, outcome: 'ok' }])
	})

	it('refuses calls once the monthly ceiling is reached, except the admin connection test', async () => {
		// $1 already spent this month against a $0.50 ceiling.
		await db.insert(aiUsage).values({ feature: 'intelligence', outcome: 'ok', estimatedCostMicroUsd: 1_000_000 })
		await setSetting('aiMonthlyCostCeilingUsd', 0.5)
		_resetAiBudgetCacheForTesting()

		const captured: Captured = {}
		await expect(aiGenerateText({ feature: 'clean-title' }, { model: mockModel('x', captured), prompt: 'p' })).rejects.toBeInstanceOf(
			AiBudgetExceededError
		)
		// Refused before the provider was called, and not billed to the ledger.
		expect(captured.maxOutputTokens).toBeUndefined()
		expect(await rowsFor('clean-title')).toEqual([])

		const test = await aiGenerateText({ feature: 'admin-test', bypassBudget: true }, { model: mockModel('pong'), prompt: 'ping' })
		expect(test.text).toBe('pong')

		// Photo to item surfaces the budget error as itself, not as a scrape failure.
		currentModel = mockModel(JSON.stringify({ title: 'x', imageUrls: [] }))
		await expect(extractFromPhoto({ bytes: new Uint8Array([1]), mediaType: 'image/png' })).rejects.toBeInstanceOf(AiBudgetExceededError)

		// Raising the ceiling lets calls through again.
		await setSetting('aiMonthlyCostCeilingUsd', 50)
		_resetAiBudgetCacheForTesting()
		expect((await aiGenerateText({ feature: 'clean-title' }, { model: mockModel('ok'), prompt: 'p' })).text).toBe('ok')
	})

	it('photo to item refuses when its toggle is off', async () => {
		await setSetting('aiPhotoExtractEnabled', false)
		currentModel = mockModel(JSON.stringify({ title: 'x', imageUrls: [] }))
		await expect(extractFromPhoto({ bytes: new Uint8Array([1]), mediaType: 'image/png' })).rejects.toMatchObject({ code: 'config_missing' })
		expect(await rowsFor('photo-extract')).toEqual([])
	})

	it('summarises the last 30 days per feature with a month-to-date total', async () => {
		const now = new Date('2026-10-15T12:00:00Z')
		await db.insert(aiUsage).values([
			{
				feature: 'intelligence',
				outcome: 'ok',
				tokensIn: 100,
				tokensOut: 10,
				estimatedCostMicroUsd: 500,
				createdAt: new Date('2026-10-10T00:00:00Z'),
			},
			{ feature: 'intelligence', outcome: 'error', createdAt: new Date('2026-10-11T00:00:00Z') },
			{
				feature: 'clean-title',
				outcome: 'ok',
				tokensIn: 5,
				tokensOut: 1,
				estimatedCostMicroUsd: 20,
				createdAt: new Date('2026-09-20T00:00:00Z'),
			},
			{ feature: 'clean-title', outcome: 'ok', estimatedCostMicroUsd: 999, createdAt: new Date('2026-08-01T00:00:00Z') },
		])
		const summary = await getAiUsageSummary({ db, now })
		expect(summary.features).toEqual([
			{ feature: 'intelligence', calls: 2, errors: 1, tokensIn: 100, tokensOut: 10, estimatedCostMicroUsd: 500 },
			{ feature: 'clean-title', calls: 1, errors: 0, tokensIn: 5, tokensOut: 1, estimatedCostMicroUsd: 20 },
		])
		expect(summary.total).toEqual({ calls: 3, errors: 1, tokensIn: 105, tokensOut: 11, estimatedCostMicroUsd: 520 })
		// Only October rows count toward the month.
		expect(summary.monthToDateCostMicroUsd).toBe(500)
	})

	it('the sweep deletes rows older than the retention window', async () => {
		const now = new Date('2026-10-02T00:00:00Z')
		await db.insert(aiUsage).values([
			{ feature: 'admin-test', outcome: 'ok', createdAt: new Date('2026-06-01T00:00:00Z') },
			{ feature: 'admin-test', outcome: 'ok', createdAt: new Date('2026-09-30T00:00:00Z') },
		])
		expect(await sweepAiUsage({ db, now, retentionDays: 90 })).toEqual({ deleted: 1 })
		expect(await rowsFor('admin-test')).toHaveLength(1)
	})
})
