// Suggest Categories (plan 42c): only titles and category names reach the
// model, child accounts and non-editors are refused before any call, the
// suggestion writes nothing, and applying it never moves a row the owner
// already placed.

import { makeGiftedItem, makeItem, makeList, makeListEditor, makeUser } from '@test/integration/factories'
import { MockLanguageModelV3 } from 'ai/test'
import { asc, eq, inArray } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '@/db'
import { aiUsage, appSettings, itemCategories, itemGroups, items, users } from '@/db/schema'

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

import { applyCategorySuggestionsImpl, suggestCategoriesImpl } from '@/api/_category-suggestions-impl'
import { _resetAiBudgetCacheForTesting } from '@/lib/ai-call'

type Captured = { prompt: string; calls: number }

function mockModel(assignments: Array<{ ref: string; category: string }>, captured: Captured): MockLanguageModelV3 {
	return new MockLanguageModelV3({
		modelId: 'claude-haiku-4-5',
		doGenerate: async args => {
			captured.calls += 1
			captured.prompt = JSON.stringify(args.prompt)
			return {
				content: [{ type: 'text' as const, text: JSON.stringify({ assignments }) }],
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

async function makeCategory(listId: number, name: string, sortOrder = 0) {
	const [row] = await db.insert(itemCategories).values({ listId, name, sortOrder }).returning()
	return row
}

async function categoryNames(listId: number) {
	const rows = await db
		.select({ name: itemCategories.name })
		.from(itemCategories)
		.where(eq(itemCategories.listId, listId))
		.orderBy(asc(itemCategories.sortOrder), asc(itemCategories.id))
	return rows.map(r => r.name)
}

async function categoryOf(itemId: number) {
	const [row] = await db.select({ categoryId: items.categoryId }).from(items).where(eq(items.id, itemId))
	return row.categoryId
}

const createdUserIds: Array<string> = []
const adult = (id: string) => ({ id, isChild: false })

describe('suggest categories', () => {
	beforeEach(async () => {
		aiValid = true
		await setSetting('aiCategorySuggestionsEnabled', true)
		_resetAiBudgetCacheForTesting()
	})
	afterEach(async () => {
		await db.delete(aiUsage)
		// Lists, items, groups and categories cascade off their owner.
		if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds.splice(0)))
		await setSetting('aiCategorySuggestionsEnabled', false)
	})

	it('sends only titles and category names, and returns suggestions held to what was sent', async () => {
		const owner = await makeUser(db, { name: 'Owner Lastname', email: 'owner.private@example.test' })
		const gifter = await makeUser(db, { name: 'Gifter Person' })
		createdUserIds.push(owner.id, gifter.id)
		const list = await makeList(db, { ownerId: owner.id, name: 'SECRET-LIST-NAME' })
		const other = await makeList(db, { ownerId: owner.id })
		const clothes = await makeCategory(list.id, 'Clothes')

		const jacket = await makeItem(db, {
			listId: list.id,
			title: 'Puffer jacket',
			notes: 'SECRET-NOTE size small',
			url: 'https://secret-shop.example.com/jacket',
			price: '249.99',
		})
		const tiles = await makeItem(db, { listId: list.id, title: 'Magnetic tiles' })
		const mug = await makeItem(db, { listId: list.id, title: 'Enamel mug' })
		await makeGiftedItem(db, { itemId: tiles.id, gifterId: gifter.id, notes: 'SECRET-CLAIM-NOTE' })
		// Already placed by the owner: not sent, and never moved.
		const placed = await makeItem(db, { listId: list.id, title: 'ALREADY-PLACED scarf', categoryId: clothes.id })
		// A group goes as one line, under its name.
		const [group] = await db.insert(itemGroups).values({ listId: list.id, type: 'or', name: 'Balance bike' }).returning()
		await makeItem(db, { listId: list.id, title: 'Strider 12', groupId: group.id, groupSortOrder: 0 })
		const elsewhere = await makeItem(db, { listId: other.id, title: 'ON-ANOTHER-LIST' })

		const captured: Captured = { prompt: '', calls: 0 }
		currentModel = mockModel(
			[
				// Matches the existing category ignoring case, so it is not new.
				{ ref: `i${jacket.id}`, category: 'clothes' },
				{ ref: `i${tiles.id}`, category: 'Kids: toys.' },
				{ ref: `g${group.id}`, category: 'Kids: toys' },
				// "Other" is not a category.
				{ ref: `i${mug.id}`, category: 'Other' },
				// Rows the model was never sent: dropped.
				{ ref: `i${placed.id}`, category: 'Kids: toys' },
				{ ref: `i${elsewhere.id}`, category: 'Kids: toys' },
				{ ref: 'i999999', category: 'Kids: toys' },
				// The same row twice: the first answer stands.
				{ ref: `i${jacket.id}`, category: 'Kids: toys' },
			],
			captured
		)

		const result = await suggestCategoriesImpl({ actor: adult(owner.id), input: { listId: list.id } })
		expect(result).toEqual({
			kind: 'ok',
			suggestions: [
				{ name: 'Clothes', isNew: false, itemIds: [jacket.id], groupIds: [] },
				{ name: 'Kids: toys', isNew: true, itemIds: [tiles.id], groupIds: [group.id] },
			],
			unplaced: 1,
		})

		// What went out: the uncategorized titles, the group, the existing
		// category, and the basic list.
		for (const sent of ['Puffer jacket', 'Magnetic tiles', 'Enamel mug', 'Balance bike', 'Strider 12', 'Clothes', 'Toys & games']) {
			expect(captured.prompt, sent).toContain(sent)
		}
		// What never goes out: notes, links, prices, claims, people, the list's
		// name, and anything already placed or on another list.
		for (const secret of [
			'SECRET-NOTE',
			'secret-shop',
			'249.99',
			'SECRET-CLAIM-NOTE',
			'Gifter',
			'Owner',
			'Lastname',
			'owner.private',
			'SECRET-LIST-NAME',
			'ALREADY-PLACED',
			'ON-ANOTHER-LIST',
		]) {
			expect(captured.prompt, secret).not.toContain(secret)
		}

		// The suggestion itself writes nothing.
		expect(await categoryNames(list.id)).toEqual(['Clothes'])
		expect(await categoryOf(jacket.id)).toBeNull()
		expect(await db.select().from(aiUsage).where(eq(aiUsage.feature, 'category-suggestions'))).toMatchObject([
			{ userId: owner.id, source: 'web', outcome: 'ok' },
		])
	})

	it('refuses before any model call: switch off, child account, no edit access, no provider, nothing to sort', async () => {
		const owner = await makeUser(db, { name: 'Owner' })
		const child = await makeUser(db, { name: 'Kid', role: 'child' })
		const editorOfChild = await makeUser(db, { name: 'Guardian' })
		const stranger = await makeUser(db, { name: 'Stranger' })
		createdUserIds.push(owner.id, child.id, editorOfChild.id, stranger.id)
		const list = await makeList(db, { ownerId: owner.id })
		const childList = await makeList(db, { ownerId: child.id })
		await makeListEditor(db, { listId: childList.id, userId: editorOfChild.id, ownerId: child.id })
		await makeItem(db, { listId: list.id, title: 'Mug' })
		const childItem = await makeItem(db, { listId: childList.id, title: 'Stickers' })
		const captured: Captured = { prompt: '', calls: 0 }
		currentModel = mockModel([{ ref: `i${childItem.id}`, category: 'Arts & crafts' }], captured)

		// A child account never starts a call, even on its own list.
		expect(await suggestCategoriesImpl({ actor: { id: child.id, isChild: true }, input: { listId: childList.id } })).toEqual({
			kind: 'error',
			reason: 'child-not-allowed',
		})
		expect(await suggestCategoriesImpl({ actor: adult(stranger.id), input: { listId: list.id } })).toEqual({
			kind: 'error',
			reason: 'not-authorized',
		})

		aiValid = false
		expect(await suggestCategoriesImpl({ actor: adult(owner.id), input: { listId: list.id } })).toEqual({
			kind: 'error',
			reason: 'not-configured',
		})
		aiValid = true

		const empty = await makeList(db, { ownerId: owner.id })
		expect(await suggestCategoriesImpl({ actor: adult(owner.id), input: { listId: empty.id } })).toEqual({
			kind: 'error',
			reason: 'nothing-to-sort',
		})

		await setSetting('aiCategorySuggestionsEnabled', false)
		expect(await suggestCategoriesImpl({ actor: adult(owner.id), input: { listId: list.id } })).toEqual({
			kind: 'error',
			reason: 'feature-disabled',
		})
		await setSetting('aiCategorySuggestionsEnabled', true)

		expect(captured.calls).toBe(0)

		// The check is on who presses: an adult who can edit the child's list
		// may use it there.
		const forChildList = await suggestCategoriesImpl({ actor: adult(editorOfChild.id), input: { listId: childList.id } })
		expect(forChildList).toMatchObject({ kind: 'ok', suggestions: [{ name: 'Arts & crafts', isNew: true, itemIds: [childItem.id] }] })
		expect(captured.calls).toBe(1)
	})

	it('applies only to rows that still have no category, and makes a category only when a row goes in it', async () => {
		const owner = await makeUser(db, { name: 'Owner' })
		const stranger = await makeUser(db, { name: 'Stranger' })
		createdUserIds.push(owner.id, stranger.id)
		const list = await makeList(db, { ownerId: owner.id })
		const other = await makeList(db, { ownerId: owner.id })
		const clothes = await makeCategory(list.id, 'Clothes', 0)
		const books = await makeCategory(list.id, 'Books', 1)
		const jacket = await makeItem(db, { listId: list.id, title: 'Jacket' })
		const tiles = await makeItem(db, { listId: list.id, title: 'Tiles' })
		// Placed by the owner after the suggestion was shown: stays put.
		const novel = await makeItem(db, { listId: list.id, title: 'Novel', categoryId: books.id })
		const elsewhere = await makeItem(db, { listId: other.id, title: 'Elsewhere' })
		const [group] = await db.insert(itemGroups).values({ listId: list.id, type: 'or' }).returning()
		const assignments = [
			{ name: 'clothes', itemIds: [jacket.id, novel.id], groupIds: [] },
			{ name: 'Kids: toys', itemIds: [tiles.id, elsewhere.id], groupIds: [group.id] },
			// Nothing eligible would go in this one, so it is not created.
			{ name: 'Empty one', itemIds: [novel.id, elsewhere.id], groupIds: [] },
		]

		expect(await applyCategorySuggestionsImpl({ userId: stranger.id, input: { listId: list.id, assignments } })).toEqual({
			kind: 'error',
			reason: 'not-authorized',
		})
		expect(await categoryOf(jacket.id)).toBeNull()

		expect(await applyCategorySuggestionsImpl({ userId: owner.id, input: { listId: list.id, assignments } })).toEqual({
			kind: 'ok',
			assigned: 3,
		})
		expect(await categoryNames(list.id)).toEqual(['Clothes', 'Books', 'Kids: toys'])
		const [toys] = await db.select().from(itemCategories).where(eq(itemCategories.name, 'Kids: toys'))
		expect(await categoryOf(jacket.id)).toBe(clothes.id)
		expect(await categoryOf(tiles.id)).toBe(toys.id)
		expect(await categoryOf(novel.id)).toBe(books.id)
		expect(await categoryOf(elsewhere.id)).toBeNull()
		const [groupAfter] = await db.select().from(itemGroups).where(eq(itemGroups.id, group.id))
		expect(groupAfter.categoryId).toBe(toys.id)
		expect(await categoryNames(other.id)).toEqual([])
	})
})
