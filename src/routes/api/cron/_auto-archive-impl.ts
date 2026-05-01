// Server-only impl for the /api/cron/auto-archive route. Lives in a
// separate file so integration tests can call it with a transactional
// `db` (per-test savepoint via `withRollback`) rather than going through
// the full route handler.
//
// The handler in `auto-archive.ts` is a thin wrapper that checks the
// CRON_SECRET and delegates here.

import { and, eq, inArray } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { giftedItems, items, lists, users } from '@/db/schema'
import type { BirthMonth } from '@/db/schema/enums'

const MONTHS: ReadonlyArray<BirthMonth> = [
	'january',
	'february',
	'march',
	'april',
	'may',
	'june',
	'july',
	'august',
	'september',
	'october',
	'november',
	'december',
]

export type AutoArchiveResult = {
	birthdayArchived: number
	christmasArchived: number
}

type Args = {
	db: SchemaDatabase
	now: Date
	archiveDaysAfterBirthday: number
	archiveDaysAfterChristmas: number
}

export async function autoArchiveImpl({ db, now, archiveDaysAfterBirthday, archiveDaysAfterChristmas }: Args): Promise<AutoArchiveResult> {
	let birthdayArchived = 0
	let christmasArchived = 0

	// === Birthday auto-archive ===
	const birthdayDate = new Date(now)
	birthdayDate.setDate(birthdayDate.getDate() - archiveDaysAfterBirthday)
	const bMonth = MONTHS[birthdayDate.getMonth()]
	const bDay = birthdayDate.getDate()

	const birthdayUsers = await db.query.users.findMany({
		where: and(eq(users.birthMonth, bMonth), eq(users.birthDay, bDay)),
		columns: { id: true },
	})

	for (const user of birthdayUsers) {
		const userLists = await db.query.lists.findMany({
			where: and(eq(lists.ownerId, user.id), eq(lists.isActive, true), inArray(lists.type, ['birthday', 'wishlist'])),
			columns: { id: true },
		})
		if (userLists.length === 0) continue

		const listIds = userLists.map(l => l.id)
		const claimedItemIds = await db
			.selectDistinct({ itemId: giftedItems.itemId })
			.from(giftedItems)
			.innerJoin(items, and(eq(items.id, giftedItems.itemId), eq(items.isArchived, false), inArray(items.listId, listIds)))

		if (claimedItemIds.length === 0) continue
		const ids = claimedItemIds.map(r => r.itemId)
		await db.update(items).set({ isArchived: true }).where(inArray(items.id, ids))
		birthdayArchived += ids.length
	}

	// === Christmas auto-archive ===
	const christmasDate = new Date(now.getFullYear(), 11, 25)
	if (now < christmasDate) christmasDate.setFullYear(christmasDate.getFullYear() - 1)
	const daysSinceChristmas = Math.floor((now.getTime() - christmasDate.getTime()) / (1000 * 60 * 60 * 24))

	if (daysSinceChristmas === archiveDaysAfterChristmas) {
		const christmasLists = await db.query.lists.findMany({
			where: and(eq(lists.type, 'christmas'), eq(lists.isActive, true)),
			columns: { id: true },
		})
		if (christmasLists.length > 0) {
			const listIds = christmasLists.map(l => l.id)
			const claimedItemIds = await db
				.selectDistinct({ itemId: giftedItems.itemId })
				.from(giftedItems)
				.innerJoin(items, and(eq(items.id, giftedItems.itemId), eq(items.isArchived, false), inArray(items.listId, listIds)))
			if (claimedItemIds.length > 0) {
				const ids = claimedItemIds.map(r => r.itemId)
				await db.update(items).set({ isArchived: true }).where(inArray(items.id, ids))
				christmasArchived += ids.length
			}
		}
	}

	return { birthdayArchived, christmasArchived }
}
