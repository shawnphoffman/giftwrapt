// "Paste Text": only the pasted text reaches the model, a link the model
// invents never reaches the preview, the feature is off by default, and
// nothing is written by the extraction itself.

import { makeList, makeUser } from '@test/integration/factories'
import { MockLanguageModelV3 } from 'ai/test'
import { eq, inArray } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '@/db'
import { aiUsage, appSettings, items, users } from '@/db/schema'

let currentModel: MockLanguageModelV3
let aiValid = true

vi.mock('@/lib/ai-config', async () => ({
	...(await vi.importActual<Record<string, unknown>>('@/lib/ai-config')),
	resolveAiConfig: () =>
		Promise.resolve({
			isValid: aiValid,
			providerType: { source: 'env', value: 'anthropic' },
			baseUrl: { source: 'missing' },
			apiKey: { source: 'env', value: 'test-key' },
			model: { source: 'env', value: 'claude-haiku-4-5' },
			maxOutputTokens: { source: 'default', value: 4096 },
		}),
}))

vi.mock('@/lib/ai-client', () => ({ createAiModel: () => currentModel }))

import { extractItemsFromTextImpl } from '@/api/_paste-items-impl'
import { _resetAiBudgetCacheForTesting } from '@/lib/ai-call'

type Captured = { prompt: string; calls: number }

function mockModel(
	extracted: Array<{ title: string; url: string; price: string; notes: string }>,
	captured: Captured
): MockLanguageModelV3 {
	return new MockLanguageModelV3({
		modelId: 'claude-haiku-4-5',
		doGenerate: async args => {
			captured.calls += 1
			captured.prompt = JSON.stringify(args.prompt)
			return {
				content: [{ type: 'text' as const, text: JSON.stringify({ items: extracted }) }],
				usage: {
					inputTokens: { total: 200, noCache: 200, cacheRead: 0, cacheWrite: 0 },
					outputTokens: { total: 60, text: 60, reasoning: 0 },
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

const createdUserIds: Array<string> = []
const TEXT = 'Ideas:\n- blue enamel mug https://shop.example.com/mug\n- wool socks size M, about $18'

describe('paste text to items', () => {
	beforeEach(async () => {
		aiValid = true
		await setSetting('aiPasteToItemsEnabled', true)
		await setSetting('importEnabled', true)
		_resetAiBudgetCacheForTesting()
	})
	afterEach(async () => {
		await db.delete(aiUsage)
		if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds.splice(0)))
		await setSetting('aiPasteToItemsEnabled', false)
	})

	it('returns drafts held to the pasted text and writes nothing', async () => {
		const user = await makeUser(db, { name: 'Paster Lastname', email: 'paster.private@example.test' })
		createdUserIds.push(user.id)
		const list = await makeList(db, { ownerId: user.id, name: 'SECRET-LIST-NAME' })
		const captured: Captured = { prompt: '', calls: 0 }
		currentModel = mockModel(
			[
				{ title: 'Blue Enamel Mug', url: 'https://shop.example.com/mug', price: '', notes: '' },
				{ title: 'Wool Socks', url: 'https://made-up.example.com/socks', price: '$18', notes: 'size M' },
			],
			captured
		)

		const result = await extractItemsFromTextImpl({ actor: { id: user.id }, input: { text: TEXT } })
		expect(result).toEqual({
			kind: 'ok',
			items: [
				{ title: 'Blue Enamel Mug', url: 'https://shop.example.com/mug', price: null, notes: null },
				// The invented link is gone; the price and note from the text stay.
				{ title: 'Wool Socks', url: null, price: '$18', notes: 'size M' },
			],
		})

		// Only the pasted text went out.
		expect(captured.prompt).toContain('blue enamel mug')
		for (const secret of ['Paster', 'Lastname', 'paster.private', 'SECRET-LIST-NAME']) expect(captured.prompt, secret).not.toContain(secret)

		// Extraction creates nothing; the preview and bulk create do that.
		expect(await db.select().from(items).where(eq(items.listId, list.id))).toEqual([])
		expect(await db.select().from(aiUsage).where(eq(aiUsage.feature, 'paste-to-items'))).toMatchObject([
			{ userId: user.id, source: 'web', outcome: 'ok' },
		])
	})

	it('is off by default, follows the import switch, and needs a provider', async () => {
		const user = await makeUser(db, { name: 'Refused' })
		createdUserIds.push(user.id)
		const captured: Captured = { prompt: '', calls: 0 }
		currentModel = mockModel([], captured)
		const input = { text: TEXT }

		aiValid = false
		expect(await extractItemsFromTextImpl({ actor: { id: user.id }, input })).toEqual({ kind: 'error', reason: 'not-configured' })
		aiValid = true

		await setSetting('importEnabled', false)
		expect(await extractItemsFromTextImpl({ actor: { id: user.id }, input })).toEqual({ kind: 'error', reason: 'feature-disabled' })
		await setSetting('importEnabled', true)

		await setSetting('aiPasteToItemsEnabled', false)
		expect(await extractItemsFromTextImpl({ actor: { id: user.id }, input })).toEqual({ kind: 'error', reason: 'feature-disabled' })

		expect(captured.calls).toBe(0)
	})
})
