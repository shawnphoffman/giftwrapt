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

import { and, eq, exists, sql } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { customHolidays, giftedItems, items, listAddons, lists } from '@/db/schema'
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
		return { itemIds: revealedItems.map(r => r.id), addonIds: revealedAddons.map(r => r.id) }
	})
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
