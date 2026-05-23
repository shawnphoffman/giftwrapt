// Server-only impl for the /api/cron/auto-archive route. Lives outside
// the routes folder so integration tests can call it with a
// transactional `db` (per-test savepoint via `withRollback`) rather
// than going through the full route handler.
//
// The handler in `src/routes/api/cron/auto-archive.ts` is a thin
// wrapper that checks the CRON_SECRET and delegates here.

import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { giftedItems, items, listAddons, lists, users } from '@/db/schema'
import type { BirthMonth } from '@/db/schema/enums'
import { customHolidayNextOccurrence } from '@/lib/custom-holidays'
import { endOfOccurrence, lastOccurrence } from '@/lib/holidays'

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
	birthdayAddonsArchived: number
	christmasArchived: number
	christmasAddonsArchived: number
	holidayArchived: number
	holidayAddonsArchived: number
	// One row per christmas list where items and/or addons were archived
	// this run. Used by the email cron to pick recipients without
	// re-running the date math. A list with only addons (no claimed items)
	// still produces a detail row so the recipient gets the email.
	christmasArchivedDetails: Array<{ listId: number; ownerId: string; itemCount: number; addonCount: number }>
	// One row per holiday list where items and/or addons were archived this
	// run. Same email-routing role as `christmasArchivedDetails`.
	holidayArchivedDetails: Array<{ listId: number; ownerId: string; holidayName: string; itemCount: number; addonCount: number }>
}

type Args = {
	db: SchemaDatabase
	now: Date
	archiveDaysAfterBirthday: number
	archiveDaysAfterChristmas: number
	archiveDaysAfterHoliday: number
}

export async function autoArchiveImpl({
	db,
	now,
	archiveDaysAfterBirthday,
	archiveDaysAfterChristmas,
	archiveDaysAfterHoliday,
}: Args): Promise<AutoArchiveResult> {
	let birthdayArchived = 0
	let birthdayAddonsArchived = 0
	let christmasArchived = 0
	let christmasAddonsArchived = 0
	let holidayArchived = 0
	let holidayAddonsArchived = 0
	const christmasArchivedDetails: AutoArchiveResult['christmasArchivedDetails'] = []
	const holidayArchivedDetails: AutoArchiveResult['holidayArchivedDetails'] = []

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
			.innerJoin(
				items,
				and(eq(items.id, giftedItems.itemId), eq(items.isArchived, false), isNull(items.pendingDeletionAt), inArray(items.listId, listIds))
			)

		if (claimedItemIds.length > 0) {
			const ids = claimedItemIds.map(r => r.itemId)
			await db.update(items).set({ isArchived: true }).where(inArray(items.id, ids))
			birthdayArchived += ids.length
		}

		// Addons are gifter-volunteered: the trigger date passing is enough
		// to reveal them, no claim gate. Run even when no items were
		// archived so addon-only lists still reveal on the received page.
		const archivedAddons = await db
			.update(listAddons)
			.set({ isArchived: true })
			.where(and(inArray(listAddons.listId, listIds), eq(listAddons.isArchived, false)))
			.returning({ id: listAddons.id })
		birthdayAddonsArchived += archivedAddons.length
	}

	// === Christmas auto-archive ===
	const christmasDate = new Date(now.getFullYear(), 11, 25)
	if (now < christmasDate) christmasDate.setFullYear(christmasDate.getFullYear() - 1)
	const daysSinceChristmas = Math.floor((now.getTime() - christmasDate.getTime()) / (1000 * 60 * 60 * 24))

	if (daysSinceChristmas === archiveDaysAfterChristmas) {
		const christmasLists = await db.query.lists.findMany({
			where: and(eq(lists.type, 'christmas'), eq(lists.isActive, true)),
			columns: { id: true, ownerId: true },
		})
		for (const list of christmasLists) {
			const claimedItemIds = await db
				.selectDistinct({ itemId: giftedItems.itemId })
				.from(giftedItems)
				.innerJoin(
					items,
					and(eq(items.id, giftedItems.itemId), eq(items.isArchived, false), isNull(items.pendingDeletionAt), eq(items.listId, list.id))
				)
			const ids = claimedItemIds.map(r => r.itemId)
			if (ids.length > 0) {
				await db.update(items).set({ isArchived: true }).where(inArray(items.id, ids))
				christmasArchived += ids.length
			}
			const archivedAddons = await db
				.update(listAddons)
				.set({ isArchived: true })
				.where(and(eq(listAddons.listId, list.id), eq(listAddons.isArchived, false)))
				.returning({ id: listAddons.id })
			christmasAddonsArchived += archivedAddons.length
			if (ids.length === 0 && archivedAddons.length === 0) continue
			christmasArchivedDetails.push({
				listId: list.id,
				ownerId: list.ownerId,
				itemCount: ids.length,
				addonCount: archivedAddons.length,
			})
		}
	}

	// === Generic-holiday auto-archive ===
	// Per-list date math driven by `lists.customHolidayId`: the resolved
	// custom_holidays row's next-occurrence date drives the cutoff. The
	// row's source can be 'catalog' (rule-based) or 'custom' (fixed
	// month/day). lastHolidayArchiveAt is the idempotency mark.
	const holidayLists = await db.query.lists.findMany({
		where: and(eq(lists.type, 'holiday'), eq(lists.isActive, true), isNotNull(lists.customHolidayId)),
		columns: {
			id: true,
			ownerId: true,
			customHolidayId: true,
			lastHolidayArchiveAt: true,
		},
		with: {
			customHoliday: true,
		},
	})

	for (const list of holidayLists) {
		let occurrenceStart: Date | null = null
		let occurrenceEnd: Date | null = null

		if (!list.customHoliday) continue

		// For catalog-source rows, lastOccurrence still applies (rules
		// have a duration). For custom rows, the "occurrence" is a single
		// day equal to (year, month, day).
		if (list.customHoliday.source === 'catalog' && list.customHoliday.catalogCountry && list.customHoliday.catalogKey) {
			occurrenceStart = await lastOccurrence(list.customHoliday.catalogCountry, list.customHoliday.catalogKey, now, db)
			if (occurrenceStart) {
				occurrenceEnd = await endOfOccurrence(list.customHoliday.catalogCountry, list.customHoliday.catalogKey, occurrenceStart, db)
			}
		} else if (list.customHoliday.source === 'custom') {
			// Custom date: use the most recent past occurrence (or skip if
			// all are in the future).
			const next = await customHolidayNextOccurrence(list.customHoliday, now, db)
			// "Last" = the most recent past occurrence. If next-occurrence
			// is today or earlier, that's it. Otherwise back-roll one year
			// for annual recurrence.
			if (next && next.getTime() <= now.getTime()) {
				occurrenceStart = next
			} else if (next && list.customHoliday.customYear === null) {
				// Annual: previous year's occurrence.
				occurrenceStart = new Date(Date.UTC(next.getUTCFullYear() - 1, next.getUTCMonth(), next.getUTCDate()))
			}
			if (occurrenceStart) occurrenceEnd = occurrenceStart
		}

		if (!occurrenceStart || !occurrenceEnd) continue
		const cutoff = new Date(occurrenceEnd.getTime() + archiveDaysAfterHoliday * 24 * 60 * 60 * 1000)
		if (now.getTime() < cutoff.getTime()) continue
		if (list.lastHolidayArchiveAt && list.lastHolidayArchiveAt.getTime() >= occurrenceStart.getTime()) continue

		const claimedItemIds = await db
			.selectDistinct({ itemId: giftedItems.itemId })
			.from(giftedItems)
			.innerJoin(
				items,
				and(eq(items.id, giftedItems.itemId), eq(items.isArchived, false), isNull(items.pendingDeletionAt), eq(items.listId, list.id))
			)

		const ids = claimedItemIds.map(r => r.itemId)
		if (ids.length > 0) {
			await db.update(items).set({ isArchived: true }).where(inArray(items.id, ids))
			holidayArchived += ids.length
		}

		const archivedAddons = await db
			.update(listAddons)
			.set({ isArchived: true })
			.where(and(eq(listAddons.listId, list.id), eq(listAddons.isArchived, false)))
			.returning({ id: listAddons.id })
		holidayAddonsArchived += archivedAddons.length

		if (ids.length > 0 || archivedAddons.length > 0) {
			holidayArchivedDetails.push({
				listId: list.id,
				ownerId: list.ownerId,
				holidayName: list.customHoliday.title,
				itemCount: ids.length,
				addonCount: archivedAddons.length,
			})
		}

		await db.update(lists).set({ lastHolidayArchiveAt: now }).where(eq(lists.id, list.id))
	}

	return {
		birthdayArchived,
		birthdayAddonsArchived,
		christmasArchived,
		christmasAddonsArchived,
		holidayArchived,
		holidayAddonsArchived,
		christmasArchivedDetails,
		holidayArchivedDetails,
	}
}
