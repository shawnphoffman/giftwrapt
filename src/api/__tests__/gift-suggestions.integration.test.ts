// Gifter-facing AI help: the suggestions prompt never carries claim detail,
// the feature is off by default and refused for children, a restricted
// viewer's prompt only holds what they can see, and a saved idea lands on
// the viewer's own private list.

import { makeGiftedItem, makeItem, makeList, makeListAddon, makeUser, makeUserRelationship } from '@test/integration/factories'
import { MockLanguageModelV3 } from 'ai/test'
import { and, eq, inArray } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '@/db'
import { aiUsage, appSettings, itemAiAnalysis, items, lists, users } from '@/db/schema'

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

import { getGiftIdeasForListImpl } from '@/api/_gift-ideas-impl'
import { getGiftSuggestionsImpl, getListInterestsImpl, saveGiftSuggestionImpl } from '@/api/_gift-suggestions-impl'
import { _resetAiBudgetCacheForTesting } from '@/lib/ai-call'

type Captured = { prompt: string }

function mockModel(
	suggestions: Array<{ title: string; details: string; reason: string; priceBand: string }>,
	captured: Captured
): MockLanguageModelV3 {
	return new MockLanguageModelV3({
		modelId: 'claude-haiku-4-5',
		doGenerate: async args => {
			captured.prompt = JSON.stringify(args.prompt)
			return {
				content: [{ type: 'text' as const, text: JSON.stringify({ suggestions }) }],
				usage: {
					inputTokens: { total: 500, noCache: 500, cacheRead: 0, cacheWrite: 0 },
					outputTokens: { total: 100, text: 100, reasoning: 0 },
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
const now = new Date('2026-10-02T12:00:00Z')

const SUGGESTIONS = [
	{
		title: 'Wool Hiking Socks',
		details: 'Look for a merino blend with a cushioned sole. See socks.example.com for one.',
		reason: 'They asked for a scarf and gloves.',
		priceBand: 'under-25',
	},
	{ title: 'Merino Scarf', details: 'A copy.', reason: 'A copy of what is on the list.', priceBand: '25-50' },
	{
		title: 'Trail Guide Book https://books.example.com/x',
		details: 'A regional guide small enough for a jacket pocket.',
		reason: 'They like the outdoors.',
		priceBand: 'under-25',
	},
]

describe('gift suggestions', () => {
	beforeEach(async () => {
		aiValid = true
		await setSetting('aiGiftSuggestionsEnabled', true)
		_resetAiBudgetCacheForTesting()
	})
	afterEach(async () => {
		await db.delete(aiUsage)
		if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds.splice(0)))
		await setSetting('aiGiftSuggestionsEnabled', false)
		await setSetting('intelligenceEnabled', false)
	})

	async function seed() {
		const me = await makeUser(db, { name: 'Jordan Shopper' })
		const sam = await makeUser(db, { name: 'Sam Birchwood', email: 'sam.private@example.test' })
		const zeb = await makeUser(db, { name: 'Zebulon Quince' })
		createdUserIds.push(me.id, sam.id, zeb.id)
		const list = await makeList(db, { ownerId: sam.id, name: 'Sam Wishes', isPrimary: true })
		const scarf = await makeItem(db, { listId: list.id, title: 'Merino Scarf', price: '35', priority: 'high', notes: 'PRIVATE-ITEM-NOTE' })
		const gloves = await makeItem(db, { listId: list.id, title: 'Leather Gloves', price: '60' })
		await makeGiftedItem(db, { itemId: gloves.id, gifterId: zeb.id, totalCost: '987.65', notes: 'SECRET-CLAIM-NOTE' })
		await makeListAddon(db, { listId: list.id, userId: zeb.id, description: 'SECRET-ADDON' })
		await db.insert(itemAiAnalysis).values({ itemId: scarf.id, contentHash: 'h', analysisVersion: 1, category: 'clothing' })
		return { me, sam, zeb, list, scarf, gloves }
	}

	it('sends claimed flags but never who claimed, what it cost, or notes', async () => {
		const { me, list } = await seed()
		const captured: Captured = { prompt: '' }
		currentModel = mockModel(SUGGESTIONS, captured)

		const result = await getGiftSuggestionsImpl({ actor: { id: me.id, isChild: false }, input: { listId: list.id, budget: 50 }, now })
		expect(result.kind).toBe('ok')
		if (result.kind !== 'ok') return

		// What the model saw.
		expect(captured.prompt).toContain('Gift for: Sam')
		expect(captured.prompt).toContain('[open] Merino Scarf (price 35, priority high, clothing)')
		expect(captured.prompt).toContain('[claimed] Leather Gloves')
		expect(captured.prompt).toContain('Budget: up to 50')
		for (const secret of [
			'Zebulon',
			'Quince',
			'987.65',
			'SECRET-CLAIM-NOTE',
			'SECRET-ADDON',
			'PRIVATE-ITEM-NOTE',
			'Birchwood',
			'sam.private',
		]) {
			expect(captured.prompt, secret).not.toContain(secret)
		}

		// What the user gets: the copy of a list item is dropped and the
		// invented links are stripped.
		expect(result.recipientName).toBe('Sam')
		expect(result.suggestions.map(s => s.title)).toEqual(['Wool Hiking Socks', 'Trail Guide Book'])
		// Each idea carries enough detail to research on its own, and no link
		// of any kind: the app points at no store and no search provider.
		expect(result.suggestions[0].details).toBe('Look for a merino blend with a cushioned sole. See for one.')
		expect(JSON.stringify(result.suggestions)).not.toMatch(/https?:|www\.|\.com/u)
		expect(Object.keys(result.suggestions[0]).sort()).toEqual(['details', 'priceBand', 'reason', 'title'])

		// One ledger row, labelled, for the asking user.
		const rows = await db.select().from(aiUsage).where(eq(aiUsage.feature, 'gift-suggestions'))
		expect(rows).toMatchObject([{ userId: me.id, source: 'web', outcome: 'ok' }])
	})

	it('is off by default, needs a provider, and refuses a child', async () => {
		const { me, list } = await seed()
		const captured: Captured = { prompt: '' }
		currentModel = mockModel(SUGGESTIONS, captured)
		const input = { listId: list.id }

		expect(await getGiftSuggestionsImpl({ actor: { id: me.id, isChild: true }, input, now })).toEqual({
			kind: 'error',
			reason: 'child-not-allowed',
		})

		aiValid = false
		expect(await getGiftSuggestionsImpl({ actor: { id: me.id, isChild: false }, input, now })).toEqual({
			kind: 'error',
			reason: 'not-configured',
		})
		aiValid = true

		await setSetting('aiGiftSuggestionsEnabled', false)
		expect(await getGiftSuggestionsImpl({ actor: { id: me.id, isChild: false }, input, now })).toEqual({
			kind: 'error',
			reason: 'feature-disabled',
		})

		// Saving is behind the same flag: off means no part of the feature is reachable.
		expect(await saveGiftSuggestionImpl({ actor: { id: me.id, isChild: false }, input: { listId: list.id, title: 'X' } })).toEqual({
			kind: 'error',
			reason: 'feature-disabled',
		})

		// None of the refusals called the model or touched the ledger.
		expect(captured.prompt).toBe('')
		expect(await db.select().from(aiUsage)).toEqual([])
	})

	it('an adult can ask for ideas for a child, and nobody can ask about their own list', async () => {
		const { me, sam, list } = await seed()
		await db.update(users).set({ role: 'child' }).where(eq(users.id, sam.id))
		const captured: Captured = { prompt: '' }
		currentModel = mockModel(SUGGESTIONS, captured)
		const forChild = await getGiftSuggestionsImpl({ actor: { id: me.id, isChild: false }, input: { listId: list.id }, now })
		expect(forChild.kind).toBe('ok')

		const mine = await makeList(db, { ownerId: me.id, name: 'Mine', isPrimary: true })
		expect(await getGiftSuggestionsImpl({ actor: { id: me.id, isChild: false }, input: { listId: mine.id }, now })).toEqual({
			kind: 'error',
			reason: 'is-owner',
		})
	})

	it('a restricted viewer’s prompt holds only what they can see', async () => {
		const { me, sam, list } = await seed()
		await makeUserRelationship(db, { ownerUserId: sam.id, viewerUserId: me.id, accessLevel: 'restricted' })
		const captured: Captured = { prompt: '' }
		currentModel = mockModel(SUGGESTIONS, captured)
		const result = await getGiftSuggestionsImpl({ actor: { id: me.id, isChild: false }, input: { listId: list.id }, now })
		expect(result.kind).toBe('ok')
		expect(captured.prompt).toContain('Merino Scarf')
		// The gloves are claimed by an outsider, so the restricted filter hides them entirely.
		expect(captured.prompt).not.toContain('Leather Gloves')
	})

	it('saving a suggestion puts it on the viewer’s private ideas list for that person', async () => {
		const { me, sam, list } = await seed()

		const first = await saveGiftSuggestionImpl({
			actor: { id: me.id, isChild: false },
			input: { listId: list.id, title: 'Wool Hiking Socks', notes: 'They asked for a scarf and gloves.' },
		})
		expect(first).toMatchObject({ kind: 'ok', createdList: true })
		if (first.kind !== 'ok') return

		const [ideasList] = await db.select().from(lists).where(eq(lists.id, first.ideasListId))
		expect(ideasList).toMatchObject({
			ownerId: me.id,
			type: 'giftideas',
			isPrivate: true,
			giftIdeasTargetUserId: sam.id,
			name: 'Ideas for Sam',
		})

		// A second save reuses the list.
		const second = await saveGiftSuggestionImpl({
			actor: { id: me.id, isChild: false },
			input: { listId: list.id, title: 'Trail Guide Book' },
		})
		expect(second).toMatchObject({ kind: 'ok', createdList: false, ideasListId: first.ideasListId })
		const saved = await db.select({ title: items.title }).from(items).where(eq(items.listId, first.ideasListId))
		expect(saved.map(s => s.title).sort()).toEqual(['Trail Guide Book', 'Wool Hiking Socks'])

		// The viewer sees the ideas on Sam's list; Sam does not.
		const mineOnTheirList = await getGiftIdeasForListImpl({ userId: me.id, listId: list.id })
		expect(mineOnTheirList.sources.flatMap(s => s.items.map(i => i.title)).sort()).toEqual(['Trail Guide Book', 'Wool Hiking Socks'])
		const samsLists = await db
			.select({ id: lists.id })
			.from(lists)
			.where(and(eq(lists.ownerId, sam.id), eq(lists.type, 'giftideas')))
		expect(samsLists).toEqual([])

		// A child cannot save one, and nobody can save against their own list.
		expect(await saveGiftSuggestionImpl({ actor: { id: me.id, isChild: true }, input: { listId: list.id, title: 'X' } })).toEqual({
			kind: 'error',
			reason: 'child-not-allowed',
		})
		expect(await saveGiftSuggestionImpl({ actor: { id: sam.id, isChild: false }, input: { listId: list.id, title: 'X' } })).toEqual({
			kind: 'error',
			reason: 'is-owner',
		})
	})

	it('list interests need Intelligence on and at least three analysed items', async () => {
		const { me, list, scarf, gloves } = await seed()
		expect(await getListInterestsImpl({ userId: me.id, listId: list.id })).toEqual({ interests: [], analysedItems: 0 })

		await setSetting('intelligenceEnabled', true)
		// One facet row so far (the scarf): not enough to say anything.
		expect(await getListInterestsImpl({ userId: me.id, listId: list.id })).toEqual({ interests: [], analysedItems: 1 })

		const book = await makeItem(db, { listId: list.id, title: 'Field Guide' })
		await db.insert(itemAiAnalysis).values([
			{ itemId: gloves.id, contentHash: 'g', analysisVersion: 1, category: 'clothing' },
			{ itemId: book.id, contentHash: 'b', analysisVersion: 1, category: 'books-media' },
		])
		expect(await getListInterestsImpl({ userId: me.id, listId: list.id })).toEqual({
			interests: [
				{ category: 'clothing', count: 2 },
				{ category: 'books-media', count: 1 },
			],
			analysedItems: 3,
		})
		void scarf
	})
})
