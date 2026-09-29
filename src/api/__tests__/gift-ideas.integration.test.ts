// Gift ideas on a recipient's list (plan 18b): who sees which ideas, and the
// claim action that copies an idea into an off-list gift and deletes it.

import {
	makeDependent,
	makeDependentGuardianship,
	makeGiftedItem,
	makeItem,
	makeItemScrape,
	makeList,
	makeListEditor,
	makeUser,
	makeUserRelationship,
} from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { copyGiftIdeaToAddonImpl, getGiftIdeasForListImpl } from '@/api/_gift-ideas-impl'
import type { SchemaDatabase } from '@/db'
import { itemComments, items, itemScrapes, listAddons, lists } from '@/db/schema'
import { cleanupImageUrls } from '@/lib/storage/cleanup'

afterEach(() => {
	vi.mocked(cleanupImageUrls).mockClear()
})

// Linda owns a Christmas list; the viewer (a gifter) owns an ideas list for her.
async function scenario(tx: SchemaDatabase) {
	const linda = await makeUser(tx, { name: 'Linda' })
	const viewer = await makeUser(tx, { name: 'Viewer' })
	const christmas = await makeList(tx, { ownerId: linda.id, type: 'christmas', name: "Linda's Christmas" })
	const ideas = await makeList(tx, {
		ownerId: viewer.id,
		type: 'giftideas',
		isPrivate: true,
		giftIdeasTargetUserId: linda.id,
		name: 'Ideas for Linda',
	})
	const idea = await makeItem(tx, {
		listId: ideas.id,
		title: 'Pottery class',
		price: '140',
		url: 'https://clay.example.com/class',
		imageUrl: 'https://cdn.test/items/1/potterypottery.webp',
	})
	return { linda, viewer, christmas, ideas, idea }
}

async function ideaTitles(tx: SchemaDatabase, userId: string, listId: number) {
	const result = await getGiftIdeasForListImpl({ userId, listId, dbx: tx })
	return result.sources.flatMap(s => s.items.map(i => i.title))
}

describe('getGiftIdeasForListImpl', () => {
	it("shows the viewer's own ideas list for the recipient, grouped with owner info", async () => {
		await withRollback(async tx => {
			const { viewer, christmas, ideas } = await scenario(tx)
			const result = await getGiftIdeasForListImpl({ userId: viewer.id, listId: christmas.id, dbx: tx })
			expect(result.sources).toHaveLength(1)
			expect(result.sources[0]).toMatchObject({ list: { id: ideas.id, name: 'Ideas for Linda' }, viewerIsOwner: true })
			expect(result.sources[0].items.map(i => i.title)).toEqual(['Pottery class'])
			expect(result.sources[0].items[0].gifts).toEqual([])
		})
	})

	it('shows ideas to an editor of the ideas list, not to other gifters', async () => {
		await withRollback(async tx => {
			const { viewer, christmas, ideas } = await scenario(tx)
			const editor = await makeUser(tx)
			const stranger = await makeUser(tx)
			await makeListEditor(tx, { listId: ideas.id, userId: editor.id, ownerId: viewer.id })

			const editorResult = await getGiftIdeasForListImpl({ userId: editor.id, listId: christmas.id, dbx: tx })
			expect(editorResult.sources[0]).toMatchObject({ viewerIsOwner: false, owner: { id: viewer.id } })
			expect(await ideaTitles(tx, stranger.id, christmas.id)).toEqual([])
		})
	})

	it('hides ideas from an editor the ideas-list owner has restricted (restricted wins)', async () => {
		await withRollback(async tx => {
			const { viewer, christmas, ideas } = await scenario(tx)
			const editor = await makeUser(tx)
			await makeListEditor(tx, { listId: ideas.id, userId: editor.id, ownerId: viewer.id })
			await makeUserRelationship(tx, { ownerUserId: viewer.id, viewerUserId: editor.id, accessLevel: 'restricted' })
			expect(await ideaTitles(tx, editor.id, christmas.id)).toEqual([])
		})
	})

	it('never shows ideas to the recipient on their own list', async () => {
		await withRollback(async tx => {
			const { linda, viewer, christmas, ideas } = await scenario(tx)
			await makeListEditor(tx, { listId: ideas.id, userId: linda.id, ownerId: viewer.id })
			expect(await ideaTitles(tx, linda.id, christmas.id)).toEqual([])
		})
	})

	it('ignores ideas lists that are inactive, untargeted, or aimed at someone else', async () => {
		await withRollback(async tx => {
			const { viewer, christmas, ideas } = await scenario(tx)
			const other = await makeUser(tx)
			await tx.update(lists).set({ isActive: false }).where(eq(lists.id, ideas.id))
			const untargeted = await makeList(tx, { ownerId: viewer.id, type: 'giftideas', isPrivate: true })
			await makeItem(tx, { listId: untargeted.id, title: 'Untargeted' })
			const forOther = await makeList(tx, { ownerId: viewer.id, type: 'giftideas', isPrivate: true, giftIdeasTargetUserId: other.id })
			await makeItem(tx, { listId: forOther.id, title: 'For someone else' })
			expect(await ideaTitles(tx, viewer.id, christmas.id)).toEqual([])
		})
	})

	it('excludes claimed, archived and pending-deletion ideas but keeps unavailable ones', async () => {
		await withRollback(async tx => {
			const { viewer, christmas, ideas, idea } = await scenario(tx)
			const claimer = await makeUser(tx)
			await makeGiftedItem(tx, { itemId: idea.id, gifterId: claimer.id })
			await makeItem(tx, { listId: ideas.id, title: 'Archived', isArchived: true })
			await makeItem(tx, { listId: ideas.id, title: 'Pending', pendingDeletionAt: new Date() })
			await makeItem(tx, { listId: ideas.id, title: 'Unavailable', availability: 'unavailable' })
			expect(await ideaTitles(tx, viewer.id, christmas.id)).toEqual(['Unavailable'])
		})
	})

	it('shows dependent-targeted ideas on the dependent list, including to the guardian who owns it', async () => {
		await withRollback(async tx => {
			const guardian = await makeUser(tx)
			const dep = await makeDependent(tx, { createdByUserId: guardian.id })
			await makeDependentGuardianship(tx, { guardianUserId: guardian.id, dependentId: dep.id })
			const depList = await makeList(tx, { ownerId: guardian.id, subjectDependentId: dep.id })
			const ideas = await makeList(tx, { ownerId: guardian.id, type: 'giftideas', isPrivate: true, giftIdeasTargetDependentId: dep.id })
			await makeItem(tx, { listId: ideas.id, title: 'Salmon treats' })
			expect(await ideaTitles(tx, guardian.id, depList.id)).toEqual(['Salmon treats'])
		})
	})

	it('returns nothing on todo lists and on lists the viewer cannot see', async () => {
		await withRollback(async tx => {
			const { linda, viewer } = await scenario(tx)
			const todos = await makeList(tx, { ownerId: linda.id, type: 'todos' })
			const hidden = await makeList(tx, { ownerId: linda.id, isPrivate: true })
			expect(await ideaTitles(tx, viewer.id, todos.id)).toEqual([])
			expect(await ideaTitles(tx, viewer.id, hidden.id)).toEqual([])
		})
	})

	it('orders the viewer-owned list first and ideas by priority', async () => {
		await withRollback(async tx => {
			const { viewer, linda, christmas, ideas } = await scenario(tx)
			await makeItem(tx, { listId: ideas.id, title: 'Top pick', priority: 'very-high' })
			const kate = await makeUser(tx)
			const katesIdeas = await makeList(tx, {
				ownerId: kate.id,
				type: 'giftideas',
				isPrivate: true,
				giftIdeasTargetUserId: linda.id,
				name: 'A Kate list',
			})
			await makeItem(tx, { listId: katesIdeas.id, title: 'Salad servers' })
			await makeListEditor(tx, { listId: katesIdeas.id, userId: viewer.id, ownerId: kate.id })

			const result = await getGiftIdeasForListImpl({ userId: viewer.id, listId: christmas.id, dbx: tx })
			expect(result.sources.map(s => s.list.name)).toEqual(['Ideas for Linda', 'A Kate list'])
			expect(result.sources[0].items.map(i => i.title)).toEqual(['Top pick', 'Pottery class'])
		})
	})
})

describe('copyGiftIdeaToAddonImpl', () => {
	it('creates the off-list gift, deletes the idea, detaches its scrapes, and keeps its image', async () => {
		await withRollback(async tx => {
			const { viewer, christmas, idea } = await scenario(tx)
			const scrape = await makeItemScrape(tx, { itemId: idea.id, url: 'https://clay.example.com/class', scraperId: 'fetch-provider' })
			await tx.insert(itemComments).values({ itemId: idea.id, userId: viewer.id, comment: 'note to self' })

			const result = await copyGiftIdeaToAddonImpl({
				userId: viewer.id,
				input: {
					ideaItemId: idea.id,
					listId: christmas.id,
					description: 'Pottery class',
					totalCost: '140',
					notes: 'Saturday sessions',
					url: 'https://clay.example.com/class',
					imageUrl: 'https://cdn.test/items/1/potterypottery.webp',
				},
				dbx: tx,
			})

			expect(result.kind).toBe('ok')
			if (result.kind !== 'ok') return
			expect(result.addon).toMatchObject({
				listId: christmas.id,
				userId: viewer.id,
				description: 'Pottery class',
				url: 'https://clay.example.com/class',
				imageUrl: 'https://cdn.test/items/1/potterypottery.webp',
			})
			expect(await tx.query.items.findFirst({ where: eq(items.id, idea.id) })).toBeUndefined()
			const scrapeRow = await tx.query.itemScrapes.findFirst({ where: eq(itemScrapes.id, scrape.id) })
			expect(scrapeRow).toMatchObject({ itemId: null, url: 'https://clay.example.com/class' })
			expect(cleanupImageUrls).not.toHaveBeenCalled()
		})
	})

	it("cleans up the idea's image when the off-list gift uses a different one", async () => {
		await withRollback(async tx => {
			const { viewer, christmas, idea } = await scenario(tx)
			const result = await copyGiftIdeaToAddonImpl({
				userId: viewer.id,
				input: {
					ideaItemId: idea.id,
					listId: christmas.id,
					description: 'Pottery class',
					totalCost: undefined,
					imageUrl: 'https://img.example.com/other.jpg',
				},
				dbx: tx,
			})
			expect(result.kind).toBe('ok')
			expect(cleanupImageUrls).toHaveBeenCalledWith(['https://cdn.test/items/1/potterypottery.webp'])
		})
	})

	it('rejects a claimed idea without creating anything', async () => {
		await withRollback(async tx => {
			const { viewer, christmas, idea } = await scenario(tx)
			const claimer = await makeUser(tx)
			await makeGiftedItem(tx, { itemId: idea.id, gifterId: claimer.id })
			const result = await copyGiftIdeaToAddonImpl({
				userId: viewer.id,
				input: { ideaItemId: idea.id, listId: christmas.id, description: 'x', totalCost: undefined },
				dbx: tx,
			})
			expect(result).toMatchObject({ kind: 'error', reason: 'idea-already-used' })
			expect(await tx.$count(listAddons, eq(listAddons.listId, christmas.id))).toBe(0)
		})
	})

	it('rejects a second claim of the same idea (already used)', async () => {
		await withRollback(async tx => {
			const { viewer, christmas, idea } = await scenario(tx)
			const input = { ideaItemId: idea.id, listId: christmas.id, description: 'Pottery class', totalCost: undefined }
			expect((await copyGiftIdeaToAddonImpl({ userId: viewer.id, input, dbx: tx })).kind).toBe('ok')
			expect(await copyGiftIdeaToAddonImpl({ userId: viewer.id, input, dbx: tx })).toMatchObject({
				kind: 'error',
				reason: 'idea-not-found',
			})
			expect(await tx.$count(listAddons, eq(listAddons.listId, christmas.id))).toBe(1)
		})
	})

	it('rejects a gifter who cannot edit the ideas list', async () => {
		await withRollback(async tx => {
			const { christmas, idea } = await scenario(tx)
			const stranger = await makeUser(tx)
			const result = await copyGiftIdeaToAddonImpl({
				userId: stranger.id,
				input: { ideaItemId: idea.id, listId: christmas.id, description: 'x', totalCost: undefined },
				dbx: tx,
			})
			expect(result).toMatchObject({ kind: 'error', reason: 'not-allowed' })
			expect(await tx.query.items.findFirst({ where: eq(items.id, idea.id) })).toBeDefined()
		})
	})

	it("rejects copying onto a list whose recipient isn't the ideas list's target", async () => {
		await withRollback(async tx => {
			const { viewer, idea } = await scenario(tx)
			const someoneElse = await makeUser(tx)
			const otherList = await makeList(tx, { ownerId: someoneElse.id })
			const result = await copyGiftIdeaToAddonImpl({
				userId: viewer.id,
				input: { ideaItemId: idea.id, listId: otherList.id, description: 'x', totalCost: undefined },
				dbx: tx,
			})
			expect(result).toMatchObject({ kind: 'error', reason: 'idea-not-found' })
		})
	})

	it('applies the addon own-list rule: blocked on a regular list, allowed for a guardian-owner of a dependent list', async () => {
		await withRollback(async tx => {
			// Regular: the recipient themselves edits an ideas list about them.
			const { linda, viewer, christmas, ideas, idea } = await scenario(tx)
			await makeListEditor(tx, { listId: ideas.id, userId: linda.id, ownerId: viewer.id })
			expect(
				await copyGiftIdeaToAddonImpl({
					userId: linda.id,
					input: { ideaItemId: idea.id, listId: christmas.id, description: 'x', totalCost: undefined },
					dbx: tx,
				})
			).toMatchObject({ kind: 'error', reason: 'cannot-add-to-own-list' })

			// Dependent: the guardian owns both the dependent's list and the ideas list.
			const guardian = await makeUser(tx)
			const dep = await makeDependent(tx, { createdByUserId: guardian.id })
			await makeDependentGuardianship(tx, { guardianUserId: guardian.id, dependentId: dep.id })
			const depList = await makeList(tx, { ownerId: guardian.id, subjectDependentId: dep.id })
			const depIdeas = await makeList(tx, { ownerId: guardian.id, type: 'giftideas', isPrivate: true, giftIdeasTargetDependentId: dep.id })
			const depIdea = await makeItem(tx, { listId: depIdeas.id, title: 'Salmon treats' })
			expect(
				(
					await copyGiftIdeaToAddonImpl({
						userId: guardian.id,
						input: { ideaItemId: depIdea.id, listId: depList.id, description: 'Salmon treats', totalCost: undefined },
						dbx: tx,
					})
				).kind
			).toBe('ok')
		})
	})
})
