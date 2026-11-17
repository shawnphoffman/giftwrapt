// Model slots (plan 34): an empty slot is the default config, a slot with
// only a model borrows the default provider, a slot with its own provider
// borrows nothing, and each feature asks for its own slot.

import { MockLanguageModelV3 } from 'ai/test'
import { inArray } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '@/db'
import { aiUsage, appSettings } from '@/db/schema'

type Built = { providerType: string; apiKey: string; model: string; baseUrl?: string }
const built: Array<Built> = []

vi.mock('@/lib/ai-client', () => ({
	createAiModel: (args: Built) => {
		built.push(args)
		return new MockLanguageModelV3({
			modelId: args.model,
			doGenerate: async () => ({
				content: [{ type: 'text' as const, text: 'Clean Title' }],
				usage: {
					inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
					outputTokens: { total: 2, text: 2, reasoning: 0 },
				},
				finishReason: { unified: 'stop' as const, raw: 'stop' },
				warnings: [],
			}),
		})
	},
}))

import { aiGenerateText } from '@/lib/ai-call'
import {
	_resetAiSlotWarningsForTesting,
	AI_SETTING_KEYS,
	AI_SLOT_SETTING_KEYS,
	resolveAiConfig,
	resolveAiSlotFields,
} from '@/lib/ai-config'
import { AI_FEATURE_SLOTS } from '@/lib/ai-slots'
import { loadIdentifyModel } from '@/lib/product-identify'
import { maybeCleanTitle } from '@/lib/scrapers/post-passes/clean-title'

const ALL_KEYS = [
	...Object.values(AI_SETTING_KEYS),
	...Object.values(AI_SLOT_SETTING_KEYS.fast),
	...Object.values(AI_SLOT_SETTING_KEYS.vision),
]

async function setSetting(key: string, value: unknown): Promise<void> {
	await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } })
}

async function setDefault(): Promise<void> {
	await setSetting('aiProviderType', 'anthropic')
	await setSetting('aiApiKey', 'sk-main')
	await setSetting('aiModel', 'main-model')
}

describe('AI model slots', () => {
	beforeEach(async () => {
		built.length = 0
		_resetAiSlotWarningsForTesting()
		await setDefault()
	})

	afterEach(async () => {
		await db.delete(appSettings).where(inArray(appSettings.key, ALL_KEYS))
		await db.delete(aiUsage)
		await setSetting('scrapeAiCleanTitlesEnabled', false)
	})

	it('resolves an empty slot to the default config', async () => {
		const main = await resolveAiConfig(db)
		expect(main).toMatchObject({ isValid: true, slot: 'default', slotMode: 'default' })
		for (const slot of ['fast', 'vision'] as const) {
			const cfg = await resolveAiConfig(db, slot)
			expect(cfg.slotMode).toBe('inherited')
			expect(cfg.model.value).toBe('main-model')
			expect(cfg.apiKey.value).toBe('sk-main')
			expect(cfg.providerType.value).toBe('anthropic')
		}
	})

	it('runs a model-only slot on the default provider and key', async () => {
		await setSetting('aiFastModel', 'small-model')
		const cfg = await resolveAiConfig(db, 'fast')
		expect(cfg).toMatchObject({ isValid: true, slotMode: 'model' })
		expect(cfg.model.value).toBe('small-model')
		expect(cfg.apiKey.value).toBe('sk-main')
		expect(cfg.providerType.value).toBe('anthropic')
		// The other slot and the default are untouched.
		expect((await resolveAiConfig(db, 'vision')).model.value).toBe('main-model')
		expect((await resolveAiConfig(db)).model.value).toBe('main-model')
	})

	it('gives a slot with its own provider nothing from the default but the output cap', async () => {
		await setSetting('aiMaxOutputTokens', 999)
		await setSetting('aiVisionProviderType', 'openai-compatible')
		await setSetting('aiVisionBaseUrl', 'https://gateway.example/v1')
		await setSetting('aiVisionApiKey', 'sk-vision')
		await setSetting('aiVisionModel', 'vision-model')
		const cfg = await resolveAiConfig(db, 'vision')
		expect(cfg).toMatchObject({ isValid: true, slotMode: 'provider' })
		expect(cfg.providerType.value).toBe('openai-compatible')
		expect(cfg.baseUrl.value).toBe('https://gateway.example/v1')
		expect(cfg.apiKey.value).toBe('sk-vision')
		expect(cfg.model.value).toBe('vision-model')
		expect(cfg.maxOutputTokens.value).toBe(999)
	})

	it('works with its own provider even when the default config is missing', async () => {
		await db.delete(appSettings).where(inArray(appSettings.key, Object.values(AI_SETTING_KEYS)))
		await setSetting('aiVisionProviderType', 'openai')
		await setSetting('aiVisionApiKey', 'sk-vision')
		await setSetting('aiVisionModel', 'vision-model')
		expect((await resolveAiConfig(db)).isValid).toBe(false)
		expect((await resolveAiConfig(db, 'vision')).isValid).toBe(true)
		expect((await resolveAiConfig(db, 'fast')).isValid).toBe(false)
	})

	it('falls back to the default when a slot names a provider but is incomplete', async () => {
		await setSetting('aiFastProviderType', 'openai')
		await setSetting('aiFastModel', 'small-model')
		// No key: a key for the default provider must not be borrowed.
		const cfg = await resolveAiConfig(db, 'fast')
		expect(cfg).toMatchObject({ isValid: true, slotMode: 'misconfigured' })
		expect(cfg.providerType.value).toBe('anthropic')
		expect(cfg.model.value).toBe('main-model')
		expect(cfg.apiKey.value).toBe('sk-main')

		// An openai-compatible slot also needs its base URL.
		await setSetting('aiFastProviderType', 'openai-compatible')
		await setSetting('aiFastApiKey', 'sk-fast')
		expect((await resolveAiConfig(db, 'fast')).slotMode).toBe('misconfigured')
	})

	it("reports the slot's own fields separately from what it resolves to", async () => {
		await setSetting('aiFastModel', 'small-model')
		const { fields, resolved } = await resolveAiSlotFields(db, 'fast')
		expect(fields.model).toEqual({ source: 'db', value: 'small-model' })
		expect(fields.providerType.source).toBe('missing')
		expect(fields.apiKey.source).toBe('missing')
		expect(resolved.apiKey.value).toBe('sk-main')
	})

	it('maps each feature to the slot the plan gives it', () => {
		expect(AI_FEATURE_SLOTS).toEqual({
			'scrape-provider': 'default',
			'clean-title': 'fast',
			'photo-extract': 'vision',
			'barcode-identify': 'fast',
			intelligence: 'default',
			'gift-suggestions': 'default',
			'paste-to-items': 'fast',
			'thank-you-draft': 'default',
			'admin-test': 'default',
		})
	})

	it("builds each feature's model from its own slot", async () => {
		await setSetting('aiFastModel', 'small-model')
		await setSetting('aiVisionProviderType', 'openai')
		await setSetting('aiVisionApiKey', 'sk-vision')
		await setSetting('aiVisionModel', 'vision-model')
		await setSetting('scrapeAiCleanTitlesEnabled', true)

		await maybeCleanTitle(db, { title: 'NOISY Title | Store', imageUrls: [] } as never)
		expect(built.at(-1)).toMatchObject({ providerType: 'anthropic', apiKey: 'sk-main', model: 'small-model' })

		await loadIdentifyModel(db, 'photo-extract')
		expect(built.at(-1)).toMatchObject({ providerType: 'openai', apiKey: 'sk-vision', model: 'vision-model' })

		await loadIdentifyModel(db, 'barcode-identify')
		expect(built.at(-1)).toMatchObject({ providerType: 'anthropic', apiKey: 'sk-main', model: 'small-model' })
	})

	it('builds every feature from the default config when no slot is set', async () => {
		await setSetting('scrapeAiCleanTitlesEnabled', true)
		await maybeCleanTitle(db, { title: 'NOISY Title | Store', imageUrls: [] } as never)
		await loadIdentifyModel(db, 'photo-extract')
		await loadIdentifyModel(db, 'barcode-identify')
		expect(built).toHaveLength(3)
		for (const b of built) expect(b).toMatchObject({ providerType: 'anthropic', apiKey: 'sk-main', model: 'main-model' })
	})

	it('costs a ledger row at the price the admin entered for its model', async () => {
		await setSetting('aiModelRates', { 'priced-model': { inPerMTok: 100, outPerMTok: 1000 } })
		try {
			const model = (await import('@/lib/ai-client')).createAiModel({ providerType: 'anthropic', apiKey: 'k', model: 'priced-model' })
			await aiGenerateText({ feature: 'admin-test', source: 'admin' }, { model, prompt: 'ping' })
			const [row] = await db.select().from(aiUsage)
			// 10 tokens in at $100 per million, 2 out at $1000 per million.
			expect(row.model).toBe('priced-model')
			expect(row.estimatedCostMicroUsd).toBe(3000)
		} finally {
			await setSetting('aiModelRates', {})
		}
	})
})
