// Server-only impl for the /api/cron/auto-archive route. Lives outside
// the routes folder so integration tests can call it with a
// transactional `db` (per-test savepoint via `withRollback`) rather
// than going through the full route handler.
//
// The handler in `src/routes/api/cron/auto-archive.ts` is a thin
// wrapper that checks the CRON_SECRET and delegates here.

import { and, eq, inArray, isNotNull, or } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { giftedItems, items, lists, users } from '@/db/schema'
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
	christmasArchived: number
	holidayArchived: number
	// One row per christmas list whose items were archived this run. Used
	// by the email cron to pick recipients without re-running the date math.
	christmasArchivedDetails: Array<{ listId: number; ownerId: string; itemCount: number }>
	// One row per holiday list whose items were archived this run. Used by
	// the email cron to pick recipients without re-running the date math.
	holidayArchivedDetails: Array<{ listId: number; ownerId: string; holidayCountry: string; holidayKey: string; itemCount: number }>
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
	let christmasArchived = 0
	let holidayArchived = 0
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
			columns: { id: true, ownerId: true },
		})
		for (const list of christmasLists) {
			const claimedItemIds = await db
				.selectDistinct({ itemId: giftedItems.itemId })
				.from(giftedItems)
				.innerJoin(items, and(eq(items.id, giftedItems.itemId), eq(items.isArchived, false), eq(items.listId, list.id)))
			if (claimedItemIds.length === 0) continue
			const ids = claimedItemIds.map(r => r.itemId)
			await db.update(items).set({ isArchived: true }).where(inArray(items.id, ids))
			christmasArchived += ids.length
			christmasArchivedDetails.push({ listId: list.id, ownerId: list.ownerId, itemCount: ids.length })
		}
	}

	// === Generic-holiday auto-archive ===
	// Per-list date math. Two paths during the transition:
	//   1. New: `lists.customHolidayId` resolves to a custom_holidays row
	//      whose next-occurrence date drives the cutoff. The row's source
	//      can be 'catalog' (rule-based) or 'custom' (fixed month/day).
	//   2. Legacy: when customHolidayId is null but holidayCountry/Key are
	//      set, fall back to the old lastOccurrence/endOfOccurrence path.
	// lastHolidayArchiveAt is the idempotency mark for both paths.
	const holidayLists = await db.query.lists.findMany({
		where: and(
			eq(lists.type, 'holiday'),
			eq(lists.isActive, true),
			or(isNotNull(lists.customHolidayId), and(isNotNull(lists.holidayCountry), isNotNull(lists.holidayKey)))
		),
		columns: {
			id: true,
			ownerId: true,
			holidayCountry: true,
			holidayKey: true,
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
		let detailCountry: string | null = null
		let detailKey: string | null = null

		if (list.customHoliday) {
			// New path: derive the occurrence from the customHolidays row.
			// For catalog-source rows, lastOccurrence still applies (rules
			// have a duration). For custom rows, the "occurrence" is a
			// single day equal to (year, month, day).
			if (list.customHoliday.source === 'catalog' && list.customHoliday.catalogCountry && list.customHoliday.catalogKey) {
				occurrenceStart = await lastOccurrence(list.customHoliday.catalogCountry, list.customHoliday.catalogKey, now, db)
				if (occurrenceStart) {
					occurrenceEnd = await endOfOccurrence(list.customHoliday.catalogCountry, list.customHoliday.catalogKey, occurrenceStart, db)
				}
				detailCountry = list.customHoliday.catalogCountry
				detailKey = list.customHoliday.catalogKey
			} else if (list.customHoliday.source === 'custom') {
				// Custom date: use the most recent past occurrence (or skip
				// if all are in the future).
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
		} else if (list.holidayCountry && list.holidayKey) {
			// Legacy path.
			occurrenceStart = await lastOccurrence(list.holidayCountry, list.holidayKey, now, db)
			if (occurrenceStart) occurrenceEnd = await endOfOccurrence(list.holidayCountry, list.holidayKey, occurrenceStart, db)
			detailCountry = list.holidayCountry
			detailKey = list.holidayKey
		}

		if (!occurrenceStart || !occurrenceEnd) continue
		const cutoff = new Date(occurrenceEnd.getTime() + archiveDaysAfterHoliday * 24 * 60 * 60 * 1000)
		if (now.getTime() < cutoff.getTime()) continue
		if (list.lastHolidayArchiveAt && list.lastHolidayArchiveAt.getTime() >= occurrenceStart.getTime()) continue

		const claimedItemIds = await db
			.selectDistinct({ itemId: giftedItems.itemId })
			.from(giftedItems)
			.innerJoin(items, and(eq(items.id, giftedItems.itemId), eq(items.isArchived, false), eq(items.listId, list.id)))

		if (claimedItemIds.length > 0) {
			const ids = claimedItemIds.map(r => r.itemId)
			await db.update(items).set({ isArchived: true }).where(inArray(items.id, ids))
			holidayArchived += ids.length
			holidayArchivedDetails.push({
				listId: list.id,
				ownerId: list.ownerId,
				holidayCountry: detailCountry ?? '',
				holidayKey: detailKey ?? '',
				itemCount: ids.length,
			})
		}

		await db.update(lists).set({ lastHolidayArchiveAt: now }).where(eq(lists.id, list.id))
	}

	return { birthdayArchived, christmasArchived, holidayArchived, christmasArchivedDetails, holidayArchivedDetails }
}
