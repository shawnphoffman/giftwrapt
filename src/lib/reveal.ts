// The one way a list's gifts are revealed in bulk. Every "reveal this list"
// trigger (the auto-archive cron passes, the deferred-due pass, the edit-view
// force-reveal, the manual "Archive all purchases" button) goes through
// `revealListPurchases`, and the reveal email is built from exactly the ids
// it returns. A row revealed once is never selected again, so nothing is
// emailed twice and nothing revealed is left out. See docs/logic.md
// "Reveal is the only email trigger".
//
// No email imports here: the cron impl and the API impls import this module
// and must stay loadable without the mail stack.

import { and, eq, exists, inArray, isNotNull, sql } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { customHolidays, giftedItems, itemGroups, items, listAddons, lists } from '@/db/schema'
import { visibleItemsWhere } from '@/lib/item-visibility'

export type RevealedPurchases = { itemIds: Array<number>; addonIds: Array<number> }

// Which per-type email toggle gates a list's reveal email:
// birthday -> enableBirthdayEmails, christmas -> enableChristmasEmails,
// holiday -> enableGenericHolidayEmails.
export type RevealFamily = 'birthday' | 'christmas' | 'holiday'

// One list's reveal, as handed to `sendRevealEmails`.
export type RevealedList = RevealedPurchases & {
	listId: number
	ownerId: string
	listName: string
	// Non-null for dependent-subject lists, where the owner is a gifter to the
	// dependent rather than the recipient.
	subjectDependentId: string | null
	family: RevealFamily
	// Occasion name for the email copy: 'birthday', 'Christmas', or the custom
	// holiday's title.
	occasion: string
}

/**
 * Reveal every claimed, still-hidden item and every still-hidden addon on a
 * list, stamping `items.archivedAt` and (when anything was revealed)
 * `lists.lastArchivedAt` with `now`. Returns exactly the ids it revealed.
 *
 * Addons have no claim gate: they are gifter-volunteered, so the trigger
 * firing is enough to reveal them, even on a list with no claimed items.
 */
export async function revealListPurchases(db: SchemaDatabase, listId: number, now: Date): Promise<RevealedPurchases> {
	return db.transaction(async tx => {
		const revealedItems = await tx
			.update(items)
			.set({ isArchived: true, archivedAt: now })
			.where(
				and(
					eq(items.listId, listId),
					visibleItemsWhere('visible'),
					exists(
						tx
							.select({ one: sql`1` })
							.from(giftedItems)
							.where(eq(giftedItems.itemId, items.id))
					)
				)
			)
			.returning({ id: items.id })
		const revealedAddons = await tx
			.update(listAddons)
			.set({ isArchived: true })
			.where(and(eq(listAddons.listId, listId), eq(listAddons.isArchived, false)))
			.returning({ id: listAddons.id })

		if (revealedItems.length > 0 || revealedAddons.length > 0) {
			await tx.update(lists).set({ lastArchivedAt: now }).where(eq(lists.id, listId))
		}
		const itemIds = revealedItems.map(r => r.id)
		// Siblings are not purchases: they stay out of the returned ids, so the
		// reveal email never lists them.
		await tidyGroupsAfterArchive(tx, itemIds, now)
		return { itemIds, addonIds: revealedAddons.map(r => r.id) }
	})
}

export type TidiedGroups = {
	// Unpicked 'or' siblings archived alongside the pick.
	siblings: Array<{ id: number; listId: number }>
	// Groups the archive left with no visible items, now deleted.
	deletedGroups: Array<{ id: number; listId: number }>
}

/**
 * Settle the groups of `archivedItemIds` (items just archived). Returns what
 * changed for the caller's live-update notifications.
 *
 * 1. Once an 'or' ("pick one") group's pick is revealed, archive the group's
 *    other visible items: the recipient asked for one and has it. Only when
 *    the group has a revealed claim and no hidden one; a sibling with a
 *    hidden claim keeps the whole group as is, so archiving never reveals
 *    that claim.
 * 2. Delete any of these groups (either type) left with no visible items, so
 *    the edit view doesn't keep an empty group. Members keep their archived
 *    state and lose `groupId` (FK set null), as on a manual group delete.
 */
export async function tidyGroupsAfterArchive(db: SchemaDatabase, archivedItemIds: Array<number>, now: Date): Promise<TidiedGroups> {
	const none: TidiedGroups = { siblings: [], deletedGroups: [] }
	if (archivedItemIds.length === 0) return none

	const touched = await db
		.selectDistinct({ id: itemGroups.id, type: itemGroups.type })
		.from(items)
		.innerJoin(itemGroups, eq(itemGroups.id, items.groupId))
		.where(and(inArray(items.id, archivedItemIds), isNotNull(items.groupId)))
	if (touched.length === 0) return none

	const siblings = await archivePickOneSiblings(
		db,
		touched.filter(g => g.type === 'or').map(g => g.id),
		now
	)

	const groupIds = touched.map(g => g.id)
	const stillVisible = await db
		.selectDistinct({ groupId: items.groupId })
		.from(items)
		.where(and(inArray(items.groupId, groupIds), visibleItemsWhere('visible')))
	const keep = new Set(stillVisible.map(r => r.groupId))
	const emptied = groupIds.filter(id => !keep.has(id))
	if (emptied.length === 0) return { siblings, deletedGroups: [] }

	await db.update(items).set({ groupSortOrder: null }).where(inArray(items.groupId, emptied))
	const deletedGroups = await db
		.delete(itemGroups)
		.where(inArray(itemGroups.id, emptied))
		.returning({ id: itemGroups.id, listId: itemGroups.listId })
	return { siblings, deletedGroups }
}

async function archivePickOneSiblings(
	db: SchemaDatabase,
	orGroupIds: Array<number>,
	now: Date
): Promise<Array<{ id: number; listId: number }>> {
	if (orGroupIds.length === 0) return []

	const claimedGroups = (mode: 'revealed' | 'visible') =>
		db
			.selectDistinct({ groupId: items.groupId })
			.from(items)
			.innerJoin(giftedItems, eq(giftedItems.itemId, items.id))
			.where(and(inArray(items.groupId, orGroupIds), visibleItemsWhere(mode)))
	const revealed = await claimedGroups('revealed')
	const hidden = await claimedGroups('visible')
	const hiddenIds = new Set(hidden.map(r => r.groupId))
	const targetIds = revealed.map(r => r.groupId).filter((id): id is number => id !== null && !hiddenIds.has(id))
	if (targetIds.length === 0) return []

	return db
		.update(items)
		.set({ isArchived: true, archivedAt: now })
		.where(and(inArray(items.groupId, targetIds), visibleItemsWhere('visible')))
		.returning({ id: items.id, listId: items.listId })
}

/**
 * The email family + occasion name for a list type, or null for types that
 * never get a reveal email (giftideas, todos).
 */
export async function revealFamilyForList(
	db: SchemaDatabase,
	list: { type: string; customHolidayId: string | null }
): Promise<{ family: RevealFamily; occasion: string } | null> {
	if (list.type === 'birthday' || list.type === 'wishlist') return { family: 'birthday', occasion: 'birthday' }
	if (list.type === 'christmas') return { family: 'christmas', occasion: 'Christmas' }
	if (list.type === 'holiday') {
		let occasion = 'holiday'
		if (list.customHolidayId) {
			const h = await db.query.customHolidays.findFirst({ where: eq(customHolidays.id, list.customHolidayId), columns: { title: true } })
			if (h) occasion = h.title
		}
		return { family: 'holiday', occasion }
	}
	return null
}
