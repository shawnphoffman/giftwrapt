// Server-only gift-ideas-on-a-list implementations (plan 18b). Separate from
// `gift-ideas.ts` so server-only static imports stay out of the client bundle.
//
// A gifter who owns or edits a gift-ideas list targeting a recipient sees
// those ideas on the recipient's lists, and can "claim" one: the idea is
// copied into a normal off-list gift on the list being viewed and the idea
// is hard-deleted. There is no link back from the addon to the idea.

import { and, eq, inArray, notExists, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db, type SchemaDatabase } from '@/db'
import { giftedItems, itemGroups, items, itemScrapes, lists } from '@/db/schema'
import type { Priority } from '@/db/schema/enums'
import type { ListAddon } from '@/db/schema/lists'
import { visibleItemsWhere } from '@/lib/item-visibility'
import { notifyListEvent } from '@/lib/list-event-bus'
import { canEditListAsAnyone, canViewList } from '@/lib/permissions'
import { cleanupImageUrls } from '@/lib/storage/cleanup'

import type { ItemWithGifts } from './_items-extra-impl'
import { CreateAddonInputSchema, createListAddonImpl } from './_list-addons-impl'
import type { GroupSummary } from './_lists-impl'

// ===============================
// Types
// ===============================

export type GiftIdeasSource = {
	list: { id: number; name: string }
	owner: { id: string; name: string | null; email: string; image: string | null }
	// True when the viewer owns the gift-ideas list; false when they reach it
	// as an editor.
	viewerIsOwner: boolean
	// Unclaimed, visible ideas only. `gifts` is always empty.
	items: Array<ItemWithGifts>
	// The ideas list's groups that still have an idea in `items`. Render
	// with `buildListEntries`, as the list itself does: a grouped idea takes
	// its group's priority.
	groups: Array<GroupSummary>
}

export type GetGiftIdeasForListResult = { kind: 'ok'; sources: Array<GiftIdeasSource> }

export const CopyGiftIdeaInputSchema = CreateAddonInputSchema.extend({
	ideaItemId: z.number().int().positive(),
})

export type CopyGiftIdeaResult =
	| { kind: 'ok'; addon: ListAddon }
	| {
			kind: 'error'
			reason:
				| 'idea-not-found'
				| 'idea-already-used'
				| 'group-out-of-order'
				| 'not-allowed'
				| 'list-not-found'
				| 'not-visible'
				| 'cannot-add-to-own-list'
	  }

type ListRow = {
	id: number
	ownerId: string
	subjectDependentId: string | null
	isPrivate: boolean
	isActive: boolean
	type: string
}

// ===============================
// Helpers
// ===============================

// Owner, or anyone `canEditList` admits. One predicate gates both seeing and
// copying ideas.
async function canUseIdeasList(userId: string, ideasList: ListRow, dbx: SchemaDatabase): Promise<boolean> {
	return (await canEditListAsAnyone(userId, ideasList, dbx)).ok
}

// A gift-ideas list applies to a recipient list when its target is the
// recipient: the subject dependent on dependent lists, else the list owner.
function targetsRecipient(
	ideasList: { giftIdeasTargetUserId: string | null; giftIdeasTargetDependentId: string | null },
	recipientList: ListRow
): boolean {
	return recipientList.subjectDependentId
		? ideasList.giftIdeasTargetDependentId === recipientList.subjectDependentId
		: ideasList.giftIdeasTargetUserId === recipientList.ownerId
}

// Mirrors where Off-List Gifts can be added: a gifter view of a non-todo,
// non-ideas list the viewer doesn't own (dependent lists excepted).
function recipientListAcceptsIdeas(list: ListRow, userId: string): boolean {
	if (list.type === 'todos' || list.type === 'giftideas') return false
	if (list.ownerId === userId && !list.subjectDependentId) return false
	return true
}

// What the copy transaction hands back: the result, plus what to clean up and
// notify about once it has committed.
type CopyOutcome = {
	result: CopyGiftIdeaResult
	removed: { ideaListId: number; ideaImageUrl: string | null; archivedSiblingIds: Array<number> } | null
}

function copyFailed(reason: Extract<CopyGiftIdeaResult, { kind: 'error' }>['reason']): CopyOutcome {
	return { result: { kind: 'error', reason }, removed: null }
}

const priorityRank: Record<Priority, number> = { 'very-high': 4, high: 3, normal: 2, low: 1 }

const listColumns = { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true, type: true } as const

// ===============================
// Read
// ===============================

export async function getGiftIdeasForListImpl(args: {
	userId: string
	listId: number
	dbx?: SchemaDatabase
}): Promise<GetGiftIdeasForListResult> {
	const { userId, listId, dbx = db } = args
	const empty: GetGiftIdeasForListResult = { kind: 'ok', sources: [] }

	const list = await dbx.query.lists.findFirst({ where: eq(lists.id, listId), columns: listColumns })
	if (!list || !recipientListAcceptsIdeas(list, userId)) return empty
	if (!(await canViewList(userId, list, dbx)).ok) return empty

	const candidates = await dbx.query.lists.findMany({
		where: and(
			eq(lists.type, 'giftideas'),
			eq(lists.isActive, true),
			list.subjectDependentId
				? eq(lists.giftIdeasTargetDependentId, list.subjectDependentId)
				: eq(lists.giftIdeasTargetUserId, list.ownerId)
		),
		columns: { ...listColumns, name: true },
		with: { owner: { columns: { id: true, name: true, email: true, image: true } } },
	})

	const usable: typeof candidates = []
	for (const candidate of candidates) {
		if (await canUseIdeasList(userId, candidate, dbx)) usable.push(candidate)
	}
	if (usable.length === 0) return empty

	const ideaRows = await dbx.query.items.findMany({
		where: and(
			inArray(
				items.listId,
				usable.map(l => l.id)
			),
			visibleItemsWhere('visible'),
			notExists(
				dbx
					.select({ one: sql`1` })
					.from(giftedItems)
					.where(eq(giftedItems.itemId, items.id))
			)
		),
	})

	const groupIds = [...new Set(ideaRows.map(i => i.groupId).filter((id): id is number => id !== null))]
	const groupRows =
		groupIds.length === 0
			? []
			: await dbx.query.itemGroups.findMany({
					where: inArray(itemGroups.id, groupIds),
					columns: { id: true, listId: true, type: true, name: true, priority: true, sortOrder: true },
				})

	const sources: Array<GiftIdeasSource> = usable
		.map(ideasList => ({
			list: { id: ideasList.id, name: ideasList.name },
			owner: ideasList.owner,
			viewerIsOwner: ideasList.ownerId === userId,
			items: ideaRows
				.filter(i => i.listId === ideasList.id)
				.sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority] || a.id - b.id)
				.map(i => ({ ...i, gifts: [], commentCount: 0 })),
			groups: groupRows
				.filter(g => g.listId === ideasList.id)
				.map(({ id, type, name, priority, sortOrder }) => ({ id, type, name, priority, sortOrder })),
		}))
		.filter(s => s.items.length > 0)
		// The viewer's own lists first, then by name.
		.sort((a, b) => Number(b.viewerIsOwner) - Number(a.viewerIsOwner) || a.list.name.localeCompare(b.list.name))

	return { kind: 'ok', sources }
}

// ===============================
// Copy an idea into an off-list gift
// ===============================

export async function copyGiftIdeaToAddonImpl(args: {
	userId: string
	input: z.infer<typeof CopyGiftIdeaInputSchema>
	dbx?: SchemaDatabase
}): Promise<CopyGiftIdeaResult> {
	const { userId, input, dbx = db } = args
	const { ideaItemId, ...addonInput } = input

	const { result, removed } = await dbx.transaction(async (tx): Promise<CopyOutcome> => {
		// Lock the idea so two gifters claiming it at once serialize; the loser
		// finds it gone and gets 'idea-not-found'.
		const locked = (await tx.execute(sql`SELECT id FROM items WHERE id = ${ideaItemId} FOR UPDATE`)) as { rows: Array<unknown> }
		if (locked.rows.length === 0) return copyFailed('idea-not-found')

		const idea = await tx.query.items.findFirst({
			where: and(eq(items.id, ideaItemId), visibleItemsWhere('visible')),
			columns: { id: true, listId: true, imageUrl: true, groupId: true, groupSortOrder: true },
		})
		if (!idea) return copyFailed('idea-not-found')

		const ideasList = await tx.query.lists.findFirst({
			where: eq(lists.id, idea.listId),
			columns: { ...listColumns, giftIdeasTargetUserId: true, giftIdeasTargetDependentId: true },
		})
		if (!ideasList || ideasList.type !== 'giftideas' || !ideasList.isActive) return copyFailed('idea-not-found')

		const recipientList = await tx.query.lists.findFirst({ where: eq(lists.id, addonInput.listId), columns: listColumns })
		if (!recipientList) return copyFailed('list-not-found')
		if (!targetsRecipient(ideasList, recipientList)) return copyFailed('idea-not-found')

		if (!(await canUseIdeasList(userId, ideasList, tx))) return copyFailed('not-allowed')

		// A claimed idea would hit the pending-deletion orphan flow on delete.
		const claimCount = await tx.$count(giftedItems, eq(giftedItems.itemId, idea.id))
		if (claimCount > 0) return copyFailed('idea-already-used')

		// Group rules apply as they do to a claim, under the same group row
		// lock. A used idea is deleted rather than left with a claim, so in an
		// `order` group any earlier idea still on the list blocks this one.
		let pickOneGroupId: number | null = null
		if (idea.groupId !== null) {
			await tx.execute(sql`SELECT id FROM item_groups WHERE id = ${idea.groupId} FOR UPDATE`)
			const group = await tx.query.itemGroups.findFirst({ where: eq(itemGroups.id, idea.groupId), columns: { id: true, type: true } })
			if (group?.type === 'or') pickOneGroupId = group.id
			if (group?.type === 'order' && idea.groupSortOrder !== null) {
				const earlier = await tx.$count(
					items,
					and(
						eq(items.groupId, group.id),
						visibleItemsWhere('visible'),
						sql`${items.groupSortOrder} IS NOT NULL`,
						sql`${items.groupSortOrder} < ${idea.groupSortOrder}`
					)
				)
				if (earlier > 0) return copyFailed('group-out-of-order')
			}
		}

		// Normal addon rules apply (own-list guard, canViewList, image mirroring).
		const created = await createListAddonImpl({ userId, input: addonInput, dbx: tx })
		if (created.kind === 'error') return copyFailed(created.reason)

		// Keep the idea's scraped data: detach the scrape rows so the URL-keyed
		// cache still offers its images, instead of cascading them away.
		await tx.update(itemScrapes).set({ itemId: null }).where(eq(itemScrapes.itemId, idea.id))
		// Direct delete, not deleteItemImpl: no pending-deletion branch (there
		// are no claims) and no storage cleanup (the image may now be the addon's).
		await tx.delete(items).where(eq(items.id, idea.id))

		// Using one idea in a pick-one group is the pick: archive the rest and
		// delete the emptied group, as a reveal does for a pick-one group on a
		// list. Archived ideas stay in the ideas list's organize view. An idea
		// with a claim of its own is left alone.
		let archivedSiblingIds: Array<number> = []
		if (pickOneGroupId !== null) {
			const archived = await tx
				.update(items)
				.set({ isArchived: true, archivedAt: new Date() })
				.where(
					and(
						eq(items.groupId, pickOneGroupId),
						visibleItemsWhere('visible'),
						notExists(
							tx
								.select({ one: sql`1` })
								.from(giftedItems)
								.where(eq(giftedItems.itemId, items.id))
						)
					)
				)
				.returning({ id: items.id })
			archivedSiblingIds = archived.map(r => r.id)
			const stillVisible = await tx.$count(items, and(eq(items.groupId, pickOneGroupId), visibleItemsWhere('visible')))
			if (stillVisible === 0) {
				await tx.update(items).set({ groupSortOrder: null }).where(eq(items.groupId, pickOneGroupId))
				await tx.delete(itemGroups).where(eq(itemGroups.id, pickOneGroupId))
			}
		}

		return {
			result: { kind: 'ok', addon: created.addon },
			removed: { ideaListId: idea.listId, ideaImageUrl: idea.imageUrl, archivedSiblingIds },
		}
	})

	if (result.kind === 'ok' && removed) {
		// The idea's image is handed over when the addon kept it; otherwise it's orphaned.
		if (removed.ideaImageUrl && removed.ideaImageUrl !== result.addon.imageUrl) await cleanupImageUrls([removed.ideaImageUrl])
		notifyListEvent({ kind: 'item', listId: removed.ideaListId, itemId: ideaItemId, shape: 'removed' })
		for (const itemId of removed.archivedSiblingIds) notifyListEvent({ kind: 'item', listId: removed.ideaListId, itemId })
	}
	return result
}
