// Gifter-facing AI help: the suggestions prompt never carries claim detail,
// the feature is off by default and refused for children, a restricted
// viewer's prompt only holds what they can see, a saved idea lands on the
// viewer's own private list, and the last answer is kept for the asker
// alone (plan 29a).

import {
	makeDependent,
	makeDependentGuardianship,
	makeGiftedItem,
	makeItem,
	makeList,
	makeListAddon,
	makeUser,
	makeUserRelationship,
} from '@test/integration/factories'
import { MockLanguageModelV3 } from 'ai/test'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '@/db'
import {
	aiUsage,
	appSettings,
	customHolidays,
	dependents,
	giftSuggestionFeedback,
	giftSuggestions,
	giftSuggestionSets,
	itemAiAnalysis,
	items,
	lists,
	users,
} from '@/db/schema'

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

import { getGiftContextImpl } from '@/api/_gift-context-impl'
import { getGiftIdeasForListImpl } from '@/api/_gift-ideas-impl'
import {
	clearGiftSuggestionFeedbackImpl,
	getGiftSuggestionsImpl,
	getLatestGiftSuggestionSetImpl,
	getListInterestsImpl,
	saveGiftSuggestionImpl,
	setGiftSuggestionFeedbackImpl,
} from '@/api/_gift-suggestions-impl'
import { _resetAiBudgetCacheForTesting } from '@/lib/ai-call'
import { sweepGiftSuggestionSets } from '@/lib/gift-suggestions/sets'

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

	it('takes the occasion from the type of list, not from the user', async () => {
		const { me, sam } = await seed()
		const captured: Captured = { prompt: '' }
		currentModel = mockModel(SUGGESTIONS, captured)
		const ask = async (listId: number) => {
			await getGiftSuggestionsImpl({ actor: { id: me.id, isChild: false }, input: { listId }, now })
			return captured.prompt
		}

		const christmas = await makeList(db, { ownerId: sam.id, name: 'Sam Xmas', type: 'christmas' })
		await makeItem(db, { listId: christmas.id, title: 'Slippers' })
		expect(await ask(christmas.id)).toContain('Occasion: Christmas')

		const birthday = await makeList(db, { ownerId: sam.id, name: 'Sam Bday', type: 'birthday' })
		await makeItem(db, { listId: birthday.id, title: 'Cake Stand' })
		expect(await ask(birthday.id)).toContain('Occasion: birthday')

		const [holiday] = await db
			.insert(customHolidays)
			.values({ title: 'Graduation', source: 'custom', customMonth: 6, customDay: 1 })
			.returning()
		const holidayList = await makeList(db, { ownerId: sam.id, name: 'Sam Grad', type: 'holiday', customHolidayId: holiday.id })
		await makeItem(db, { listId: holidayList.id, title: 'Pen' })
		try {
			expect(await ask(holidayList.id)).toContain('Occasion: Graduation')
		} finally {
			await db.delete(customHolidays).where(eq(customHolidays.id, holiday.id))
		}

		// A plain wishlist has no occasion unless the birthday is close.
		const wishlist = await makeList(db, { ownerId: sam.id, name: 'Sam Anytime' })
		await makeItem(db, { listId: wishlist.id, title: 'Notebook' })
		expect(await ask(wishlist.id)).toContain('Occasion: none given')
		await db.update(users).set({ birthMonth: 'october', birthDay: 20 }).where(eq(users.id, sam.id))
		expect(await ask(wishlist.id)).toContain('Occasion: birthday')
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

	it('keeps the answer for the asker and replaces it on the next ask', async () => {
		const { me, sam, list } = await seed()
		const captured: Captured = { prompt: '' }
		currentModel = mockModel(SUGGESTIONS, captured)
		const actor = { id: me.id, isChild: false }

		const first = await getGiftSuggestionsImpl({ actor, input: { listId: list.id, budget: 50 }, now })
		expect(first.kind).toBe('ok')
		if (first.kind !== 'ok') return
		expect(first.set).toMatchObject({ listId: list.id, occasion: null, budget: 50, createdAt: now.toISOString() })

		// One set for (asker, Sam), holding the sanitized rows in order.
		const sets = await db.select().from(giftSuggestionSets).where(eq(giftSuggestionSets.userId, me.id))
		expect(sets).toHaveLength(1)
		expect(sets[0]).toMatchObject({ id: first.set.id, recipientUserId: sam.id, recipientDependentId: null })
		const rows = await db
			.select()
			.from(giftSuggestions)
			.where(eq(giftSuggestions.setId, first.set.id))
			.orderBy(asc(giftSuggestions.position))
		expect(rows.map(r => [r.position, r.title, r.titleKey, r.priceBand])).toEqual([
			[0, 'Wool Hiking Socks', 'wool hiking socks', 'under-25'],
			[1, 'Trail Guide Book', 'trail guide book', 'under-25'],
		])
		// Links were stripped before storing, same as before showing.
		expect(JSON.stringify(rows)).not.toMatch(/https?:|www\.|\.com/u)

		// Reading it back needs no model call and shows the same ideas.
		const latest = await getLatestGiftSuggestionSetImpl({ actor, input: { listId: list.id } })
		expect(latest).toEqual({
			kind: 'ok',
			recipientName: 'Sam',
			set: { ...first.set, suggestions: first.suggestions, savedTitles: [], addedTitles: [], feedback: [] },
		})
		expect(await db.select().from(aiUsage)).toHaveLength(1)

		// Asking again replaces the set; the old rows cascade away.
		const later = new Date(now.getTime() + 60_000)
		const second = await getGiftSuggestionsImpl({ actor, input: { listId: list.id }, now: later })
		expect(second.kind).toBe('ok')
		if (second.kind !== 'ok') return
		expect(second.set.id).not.toBe(first.set.id)
		expect(second.set).toMatchObject({ budget: null, createdAt: later.toISOString() })
		const after = await db.select({ id: giftSuggestionSets.id }).from(giftSuggestionSets).where(eq(giftSuggestionSets.userId, me.id))
		expect(after).toEqual([{ id: second.set.id }])
		expect(await db.select().from(giftSuggestions).where(eq(giftSuggestions.setId, first.set.id))).toEqual([])
	})

	it('only the asker can read their stored answer', async () => {
		const { me, sam, zeb, list } = await seed()
		const captured: Captured = { prompt: '' }
		currentModel = mockModel(SUGGESTIONS, captured)
		const stored = await getGiftSuggestionsImpl({ actor: { id: me.id, isChild: false }, input: { listId: list.id }, now })
		expect(stored.kind).toBe('ok')

		// Another gifter looking at the same list has no set of their own.
		expect(await getLatestGiftSuggestionSetImpl({ actor: { id: zeb.id, isChild: false }, input: { listId: list.id } })).toEqual({
			kind: 'ok',
			recipientName: 'Sam',
			set: null,
		})
		// The recipient is redirected like everywhere in the gifter view.
		expect(await getLatestGiftSuggestionSetImpl({ actor: { id: sam.id, isChild: false }, input: { listId: list.id } })).toEqual({
			kind: 'error',
			reason: 'is-owner',
		})
		// Someone Sam has shut out cannot even tell whether a set exists.
		await makeUserRelationship(db, { ownerUserId: sam.id, viewerUserId: zeb.id, accessLevel: 'none' })
		expect(await getLatestGiftSuggestionSetImpl({ actor: { id: zeb.id, isChild: false }, input: { listId: list.id } })).toEqual({
			kind: 'error',
			reason: 'not-found',
		})
		// A child, and the flag off, are refused the same way as asking.
		expect(await getLatestGiftSuggestionSetImpl({ actor: { id: me.id, isChild: true }, input: { listId: list.id } })).toEqual({
			kind: 'error',
			reason: 'child-not-allowed',
		})
		await setSetting('aiGiftSuggestionsEnabled', false)
		expect(await getLatestGiftSuggestionSetImpl({ actor: { id: me.id, isChild: false }, input: { listId: list.id } })).toEqual({
			kind: 'error',
			reason: 'feature-disabled',
		})
	})

	it('marks ideas the asker has since saved or added, and keys a dependent’s set to the dependent', async () => {
		const { me, sam, list } = await seed()
		const captured: Captured = { prompt: '' }
		currentModel = mockModel(SUGGESTIONS, captured)
		const actor = { id: me.id, isChild: false }
		const stored = await getGiftSuggestionsImpl({ actor, input: { listId: list.id }, now })
		expect(stored.kind).toBe('ok')

		await saveGiftSuggestionImpl({ actor, input: { listId: list.id, title: 'Wool Hiking Socks' } })
		// An off-list gift matches by the title key, so case and punctuation do not matter.
		await makeListAddon(db, { listId: list.id, userId: me.id, description: 'trail guide book!' })
		const latest = await getLatestGiftSuggestionSetImpl({ actor, input: { listId: list.id } })
		expect(latest.kind).toBe('ok')
		if (latest.kind !== 'ok' || !latest.set) return
		expect(latest.set.savedTitles).toEqual(['Wool Hiking Socks'])
		expect(latest.set.addedTitles).toEqual(['Trail Guide Book'])

		// A list made for a dependent stores the set against the dependent.
		const fido = await makeDependent(db, { name: 'Fido', createdByUserId: sam.id })
		await makeDependentGuardianship(db, { guardianUserId: sam.id, dependentId: fido.id })
		try {
			const fidoList = await makeList(db, { ownerId: sam.id, name: 'Fido Wishes', subjectDependentId: fido.id })
			await makeItem(db, { listId: fidoList.id, title: 'Squeaky Ball' })
			const forFido = await getGiftSuggestionsImpl({ actor, input: { listId: fidoList.id }, now })
			expect(forFido.kind).toBe('ok')
			if (forFido.kind !== 'ok') return
			const [set] = await db.select().from(giftSuggestionSets).where(eq(giftSuggestionSets.id, forFido.set.id))
			expect(set).toMatchObject({ userId: me.id, recipientUserId: null, recipientDependentId: fido.id })
			// Sam's own set is untouched; each recipient has their own.
			const mine = await db.select({ id: giftSuggestionSets.id }).from(giftSuggestionSets).where(eq(giftSuggestionSets.userId, me.id))
			expect(mine).toHaveLength(2)
			const back = await getLatestGiftSuggestionSetImpl({ actor, input: { listId: fidoList.id } })
			expect(back).toMatchObject({ kind: 'ok', recipientName: 'Fido', set: { id: forFido.set.id } })
		} finally {
			await db.delete(dependents).where(eq(dependents.id, fido.id))
		}
	})

	it('the cleanup sweep drops sets past the retention window', async () => {
		const { me, sam, zeb, list } = await seed()
		const captured: Captured = { prompt: '' }
		currentModel = mockModel(SUGGESTIONS, captured)
		const fresh = await getGiftSuggestionsImpl({ actor: { id: me.id, isChild: false }, input: { listId: list.id }, now })
		expect(fresh.kind).toBe('ok')
		if (fresh.kind !== 'ok') return
		const [old] = await db
			.insert(giftSuggestionSets)
			.values({ userId: me.id, recipientUserId: zeb.id, createdAt: new Date(now.getTime() - 91 * 86_400_000) })
			.returning()
		await db
			.insert(giftSuggestions)
			.values({ setId: old.id, position: 0, title: 'Old', titleKey: 'old', details: '', reason: '', priceBand: 'unknown' })

		expect(await sweepGiftSuggestionSets({ db, now, retentionDays: 90 })).toEqual({ deleted: 1 })
		const left = await db.select({ id: giftSuggestionSets.id }).from(giftSuggestionSets).where(eq(giftSuggestionSets.userId, me.id))
		expect(left).toEqual([{ id: fresh.set.id }])
		expect(await db.select().from(giftSuggestions).where(eq(giftSuggestions.setId, old.id))).toEqual([])
		void sam
	})

	it('builds a profile: open, claimed, received, removed, unavailable, archived addon, and marked, with no gifter detail', async () => {
		const { me, sam, zeb, list } = await seed()
		const captured: Captured = { prompt: '' }
		currentModel = mockModel(SUGGESTIONS, captured)
		const asMe = { id: me.id, isChild: false }
		const month = (d: Date) => d.toISOString().slice(0, 7)
		const lastYear = new Date('2025-12-20T12:00:00Z')
		const threeYearsAgo = new Date('2023-06-01T12:00:00Z')

		// Received: revealed with a claim by someone else. Removed: revealed with no claim.
		const robe = await makeItem(db, {
			listId: list.id,
			title: 'Bath Robe',
			isArchived: true,
			archivedAt: lastYear,
			notes: 'PRIVATE-ROBE-NOTE',
		})
		await makeGiftedItem(db, { itemId: robe.id, gifterId: zeb.id, totalCost: '77.77', notes: 'SECRET-ROBE-CLAIM' })
		await makeItem(db, { listId: list.id, title: 'Desk Lamp', isArchived: true, archivedAt: new Date('2025-06-01T12:00:00Z') })
		// Older than the window: out.
		const old = await makeItem(db, { listId: list.id, title: 'Ancient Clock', isArchived: true, archivedAt: threeYearsAgo })
		await makeGiftedItem(db, { itemId: old.id, gifterId: zeb.id })
		// Unavailable: still on the list, but not a want. Pending deletion: nowhere.
		await makeItem(db, { listId: list.id, title: 'Sold Out Puzzle', availability: 'unavailable' })
		const gone = await makeItem(db, {
			listId: list.id,
			title: 'Deleted Drone',
			isArchived: true,
			archivedAt: lastYear,
			pendingDeletionAt: now,
		})
		await makeGiftedItem(db, { itemId: gone.id, gifterId: zeb.id })
		// An archived off-list gift from another gifter, and a mark.
		await makeListAddon(db, {
			listId: list.id,
			userId: zeb.id,
			description: 'Cookbook Stand',
			isArchived: true,
			totalCost: '55.55',
			notes: 'SECRET-ADDON-NOTE',
		})
		await setGiftSuggestionFeedbackImpl({
			actor: { id: zeb.id, isChild: false },
			input: { listId: list.id, title: 'Air Fryer', verdict: 'has-it' },
			now,
		})

		const result = await getGiftSuggestionsImpl({ actor: asMe, input: { listId: list.id }, now })
		expect(result.kind).toBe('ok')
		const p = captured.prompt
		expect(p).toContain('[open] Merino Scarf')
		expect(p).toContain('[claimed] Leather Gloves')
		expect(p).toContain(
			`They already have: Cookbook Stand (received ${month(now)}); Bath Robe (received ${month(lastYear)}); Air Fryer (marked by a gifter)`
		)
		expect(p).toContain('No longer on their list: Sold Out Puzzle (unavailable); Desk Lamp (removed 2025-06)')
		for (const absent of ['Ancient Clock', 'Deleted Drone', '[open] Sold Out Puzzle', 'Zebulon', '77.77', '55.55', 'SECRET', 'PRIVATE']) {
			expect(p, absent).not.toContain(absent)
		}
		// Received dates are months only.
		expect(p).not.toMatch(/received \d{4}-\d{2}-\d{2}/u)

		// The context carries the same roles for MCP, with sources and no gifter.
		const context = await getGiftContextImpl({ userId: me.id, personId: sam.id, now })
		expect(context.kind).toBe('ok')
		if (context.kind !== 'ok') return
		expect(context.context.alreadyHas).toEqual([
			{ title: 'Cookbook Stand', source: 'received', when: month(now) },
			{ title: 'Bath Robe', source: 'received', when: month(lastYear) },
			{ title: 'Air Fryer', source: 'marked', when: null },
		])
		expect(context.context.noLongerListed).toEqual([
			{ title: 'Sold Out Puzzle', reason: 'unavailable', when: null },
			{ title: 'Desk Lamp', reason: 'removed', when: '2025-06' },
		])

		// A model answer repeating a received or removed title is dropped.
		currentModel = mockModel(
			[
				...SUGGESTIONS,
				{ title: 'Bath robe', details: 'd', reason: 'r', priceBand: 'unknown' },
				{ title: 'desk lamp', details: 'd', reason: 'r', priceBand: 'unknown' },
			],
			captured
		)
		const again = await getGiftSuggestionsImpl({ actor: asMe, input: { listId: list.id }, now })
		if (again.kind === 'ok') expect(again.suggestions.map(s => s.title)).toEqual(['Wool Hiking Socks', 'Trail Guide Book'])
	})

	it('history follows the asker’s visibility: the restricted filter, own addons only, and no hidden lists', async () => {
		const { me, sam, zeb, list } = await seed()
		const captured: Captured = { prompt: '' }
		currentModel = mockModel(SUGGESTIONS, captured)
		const lastYear = new Date('2025-12-20T12:00:00Z')
		const robe = await makeItem(db, { listId: list.id, title: 'Bath Robe', isArchived: true, archivedAt: lastYear })
		await makeGiftedItem(db, { itemId: robe.id, gifterId: zeb.id })
		const mug = await makeItem(db, { listId: list.id, title: 'Camping Mug', isArchived: true, archivedAt: lastYear })
		await makeGiftedItem(db, { itemId: mug.id, gifterId: me.id })
		await makeListAddon(db, { listId: list.id, userId: zeb.id, description: 'Cookbook Stand', isArchived: true })
		await makeListAddon(db, { listId: list.id, userId: me.id, description: 'Tea Towels', isArchived: true })

		// Restricted: only the gift I gave and my own addon.
		await makeUserRelationship(db, { ownerUserId: sam.id, viewerUserId: me.id, accessLevel: 'restricted' })
		await getGiftSuggestionsImpl({ actor: { id: me.id, isChild: false }, input: { listId: list.id }, now })
		expect(captured.prompt).toContain('They already have: Tea Towels (received')
		expect(captured.prompt).toContain('Camping Mug (received 2025-12)')
		expect(captured.prompt).not.toContain('Bath Robe')
		expect(captured.prompt).not.toContain('Cookbook Stand')

		// A private list nobody shared: its history is nowhere, even for a full viewer.
		const secret = await makeList(db, { ownerId: sam.id, name: 'Sam Secret', isPrivate: true })
		const watch = await makeItem(db, { listId: secret.id, title: 'Gold Watch', isArchived: true, archivedAt: lastYear })
		await makeGiftedItem(db, { itemId: watch.id, gifterId: me.id })
		await getGiftSuggestionsImpl({ actor: { id: zeb.id, isChild: false }, input: { listId: list.id }, now })
		expect(captured.prompt).toContain('Bath Robe (received 2025-12)')
		expect(captured.prompt).not.toContain('Gold Watch')
	})

	it('“They have it” reaches every gifter’s prompt, a thumbs down only the marker’s, and neither says who', async () => {
		const { me, sam, zeb, list } = await seed()
		const captured: Captured = { prompt: '' }
		currentModel = mockModel(SUGGESTIONS, captured)
		const asMe = { id: me.id, isChild: false }
		const asZeb = { id: zeb.id, isChild: false }

		// Zeb marks the air fryer as owned; Jordan turns down the socks.
		expect(
			await setGiftSuggestionFeedbackImpl({ actor: asZeb, input: { listId: list.id, title: 'Air Fryer', verdict: 'has-it' }, now })
		).toEqual({
			kind: 'ok',
		})
		expect(
			await setGiftSuggestionFeedbackImpl({
				actor: asMe,
				input: { listId: list.id, title: 'Wool Hiking Socks', verdict: 'not-for-me' },
				now,
			})
		).toEqual({ kind: 'ok' })

		// Jordan's prompt: the owned title and their own veto, nothing about Zeb.
		const mine = await getGiftSuggestionsImpl({ actor: asMe, input: { listId: list.id }, now })
		expect(mine.kind).toBe('ok')
		expect(captured.prompt).toContain('They already have: Air Fryer (marked by a gifter)')
		expect(captured.prompt).toContain('The shopper is not interested in: Wool Hiking Socks')
		expect(captured.prompt).not.toContain('Zebulon')
		// The vetoed socks are dropped from the answer even though the model returned them.
		if (mine.kind === 'ok') expect(mine.suggestions.map(s => s.title)).toEqual(['Trail Guide Book'])

		// Zeb's prompt: the same owned title, and no sign of Jordan's veto.
		await getGiftSuggestionsImpl({ actor: asZeb, input: { listId: list.id }, now })
		expect(captured.prompt).toContain('They already have: Air Fryer')
		expect(captured.prompt).toContain('The shopper is not interested in: nothing in particular')

		// Something marked as owned is dropped from the answer too.
		currentModel = mockModel([...SUGGESTIONS, { title: 'Air fryer', details: 'd', reason: 'r', priceBand: 'unknown' }], captured)
		const again = await getGiftSuggestionsImpl({ actor: asZeb, input: { listId: list.id }, now })
		if (again.kind === 'ok') expect(again.suggestions.map(s => s.title)).toEqual(['Wool Hiking Socks', 'Trail Guide Book'])

		// The gift context (and so the MCP tool) carries the owned titles, never the marker.
		const context = await getGiftContextImpl({ userId: me.id, personId: sam.id, now })
		expect(context.kind).toBe('ok')
		if (context.kind === 'ok') expect(context.context.alreadyHas).toEqual([{ title: 'Air Fryer', source: 'marked', when: null }])
	})

	it('marks are by title, survive regeneration, can be undone, and follow the asking gate', async () => {
		const { me, sam, zeb, list } = await seed()
		const captured: Captured = { prompt: '' }
		currentModel = mockModel(SUGGESTIONS, captured)
		const asMe = { id: me.id, isChild: false }

		const first = await getGiftSuggestionsImpl({ actor: asMe, input: { listId: list.id }, now })
		expect(first.kind).toBe('ok')
		await setGiftSuggestionFeedbackImpl({ actor: asMe, input: { listId: list.id, title: 'Wool Hiking Socks', verdict: 'has-it' }, now })
		// Marking again replaces the verdict rather than adding a row.
		await setGiftSuggestionFeedbackImpl({
			actor: asMe,
			input: { listId: list.id, title: 'wool hiking socks!', verdict: 'not-for-me' },
			now,
		})
		const rows = await db.select().from(giftSuggestionFeedback).where(eq(giftSuggestionFeedback.userId, me.id))
		expect(rows).toHaveLength(1)
		expect(rows[0]).toMatchObject({
			recipientUserId: sam.id,
			titleKey: 'wool hiking socks',
			title: 'wool hiking socks!',
			verdict: 'not-for-me',
		})

		// The stored set reports the asker's own verdict on the matching title.
		const latest = await getLatestGiftSuggestionSetImpl({ actor: asMe, input: { listId: list.id } })
		expect(latest.kind).toBe('ok')
		if (latest.kind === 'ok') expect(latest.set?.feedback).toEqual([{ title: 'Wool Hiking Socks', verdict: 'not-for-me' }])

		// Regenerating drops the title and leaves the mark in place.
		const second = await getGiftSuggestionsImpl({ actor: asMe, input: { listId: list.id }, now: new Date(now.getTime() + 60_000) })
		if (second.kind === 'ok') expect(second.suggestions.map(s => s.title)).toEqual(['Trail Guide Book'])
		expect(await db.select().from(giftSuggestionFeedback).where(eq(giftSuggestionFeedback.userId, me.id))).toHaveLength(1)

		// Undo removes it; undoing again is still ok.
		expect(await clearGiftSuggestionFeedbackImpl({ actor: asMe, input: { listId: list.id, title: 'Wool Hiking Socks' } })).toEqual({
			kind: 'ok',
		})
		expect(await clearGiftSuggestionFeedbackImpl({ actor: asMe, input: { listId: list.id, title: 'Wool Hiking Socks' } })).toEqual({
			kind: 'ok',
		})
		expect(await db.select().from(giftSuggestionFeedback).where(eq(giftSuggestionFeedback.userId, me.id))).toEqual([])

		// The same gate as asking: the recipient, someone shut out, a child, and the flag off.
		const input = { listId: list.id, title: 'X', verdict: 'has-it' as const }
		expect(await setGiftSuggestionFeedbackImpl({ actor: { id: sam.id, isChild: false }, input, now })).toEqual({
			kind: 'error',
			reason: 'is-owner',
		})
		await makeUserRelationship(db, { ownerUserId: sam.id, viewerUserId: zeb.id, accessLevel: 'none' })
		expect(await setGiftSuggestionFeedbackImpl({ actor: { id: zeb.id, isChild: false }, input, now })).toEqual({
			kind: 'error',
			reason: 'not-found',
		})
		expect(await setGiftSuggestionFeedbackImpl({ actor: { id: me.id, isChild: true }, input, now })).toEqual({
			kind: 'error',
			reason: 'child-not-allowed',
		})
		await setSetting('aiGiftSuggestionsEnabled', false)
		expect(await setGiftSuggestionFeedbackImpl({ actor: asMe, input, now })).toEqual({ kind: 'error', reason: 'feature-disabled' })
		expect(await clearGiftSuggestionFeedbackImpl({ actor: asMe, input: { listId: list.id, title: 'X' } })).toEqual({
			kind: 'error',
			reason: 'feature-disabled',
		})
		expect(await db.select().from(giftSuggestionFeedback)).toEqual([])
	})

	it('deleting the marker or the recipient removes their marks', async () => {
		const { me, sam, list } = await seed()
		const asMe = { id: me.id, isChild: false }
		await setGiftSuggestionFeedbackImpl({ actor: asMe, input: { listId: list.id, title: 'Air Fryer', verdict: 'has-it' }, now })
		const fido = await makeDependent(db, { name: 'Fido', createdByUserId: sam.id })
		await makeDependentGuardianship(db, { guardianUserId: sam.id, dependentId: fido.id })
		const fidoList = await makeList(db, { ownerId: sam.id, name: 'Fido Wishes', subjectDependentId: fido.id })
		await setGiftSuggestionFeedbackImpl({ actor: asMe, input: { listId: fidoList.id, title: 'Squeaky Ball', verdict: 'has-it' }, now })
		expect(await db.select({ dep: giftSuggestionFeedback.recipientDependentId }).from(giftSuggestionFeedback)).toEqual([
			{ dep: null },
			{ dep: fido.id },
		])

		await db.delete(dependents).where(eq(dependents.id, fido.id))
		expect(await db.select().from(giftSuggestionFeedback)).toHaveLength(1)
		await db.delete(users).where(eq(users.id, sam.id))
		createdUserIds.splice(createdUserIds.indexOf(sam.id), 1)
		expect(await db.select().from(giftSuggestionFeedback)).toEqual([])
	})

	it('list interests need Intelligence on and at least three analysed items', async () => {
		const { me, list, scarf, gloves } = await seed()
		expect(await getListInterestsImpl({ userId: me.id, listId: list.id })).toEqual({ interests: [], analysedItems: 0 })

		await setSetting('intelligenceEnabled', true)
		// It is part of the panel, so the panel's flag switches it off too.
		await setSetting('aiGiftSuggestionsEnabled', false)
		expect(await getListInterestsImpl({ userId: me.id, listId: list.id })).toEqual({ interests: [], analysedItems: 0 })
		await setSetting('aiGiftSuggestionsEnabled', true)
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
