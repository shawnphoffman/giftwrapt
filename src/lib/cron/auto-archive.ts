// Server-only impl for the /api/cron/auto-archive route. Lives outside
// the routes folder so integration tests can call it with a
// transactional `db` (per-test savepoint via `withRollback`) rather
// than going through the full route handler.
//
// The handler in `src/routes/api/cron/auto-archive.ts` is a thin
// wrapper that checks the CRON_SECRET and delegates here.

import { and, eq, inArray, isNotNull, isNull, lte, type SQL } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { dependents, lists, users } from '@/db/schema'
import type { BirthMonth } from '@/db/schema/enums'
import { addCalendarDays, calendarDayInZone } from '@/lib/calendar-day'
import { customHolidayNextOccurrence } from '@/lib/custom-holidays'
import { endOfOccurrence, lastOccurrence } from '@/lib/holidays'
import { itemsArchivedTotal, revealsTriggeredTotal } from '@/lib/observability/metrics'
import { type RevealedList, revealFamilyForList, revealListPurchases } from '@/lib/reveal'

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
	deferredArchived: number
	deferredAddonsArchived: number
	// One row per list where items and/or addons were revealed this run, from
	// any pass, carrying exactly the ids revealed. The handler passes the whole
	// array to `sendRevealEmails`, which sends one email per owner. A list with
	// only addons (no claimed items) still produces a row.
	revealed: Array<RevealedList>
}

type Args = {
	db: SchemaDatabase
	now: Date
	archiveDaysAfterBirthday: number
	archiveDaysAfterChristmas: number
	archiveDaysAfterHoliday: number
	// Deployment time zone (`appSettings.timeZone`); decides which date
	// "today" is for the birthday / Christmas / holiday passes. Defaults
	// to UTC. The deferred-due pass compares instants and ignores it.
	timeZone?: string
}

export async function autoArchiveImpl({
	db,
	now,
	archiveDaysAfterBirthday,
	archiveDaysAfterChristmas,
	archiveDaysAfterHoliday,
	timeZone,
}: Args): Promise<AutoArchiveResult> {
	// Calendar passes below compare against the deployment's date (UTC
	// midnight of it); defer checks and timestamps keep the real `now`.
	const today = calendarDayInZone(now, timeZone)
	let birthdayArchived = 0
	let birthdayAddonsArchived = 0
	let christmasArchived = 0
	let christmasAddonsArchived = 0
	let holidayArchived = 0
	let holidayAddonsArchived = 0
	let deferredArchived = 0
	let deferredAddonsArchived = 0
	const revealed: Array<RevealedList> = []

	// === Deferred-due pass ===
	// Lists whose explicit archive deferral (`archiveDeferUntil`) has elapsed.
	// A deferred list is skipped by every normal pass below while the defer is
	// in the future, so without this pass it would be stranded (the reverse
	// date-matching never revisits its event date). Processed FIRST so that,
	// for holiday lists, setting `lastHolidayArchiveAt` here makes the normal
	// holiday pass (which matches on a date range, not an exact day) skip the
	// same list later in this run.
	const dueLists = await db.query.lists.findMany({
		where: and(
			eq(lists.isActive, true),
			isNotNull(lists.archiveDeferUntil),
			lte(lists.archiveDeferUntil, now),
			inArray(lists.type, ['birthday', 'wishlist', 'christmas', 'holiday'])
		),
		columns: { id: true, ownerId: true, name: true, type: true, subjectDependentId: true, customHolidayId: true },
	})
	for (const list of dueLists) {
		const purchases = await revealListPurchases(db, list.id, now)
		deferredArchived += purchases.itemIds.length
		deferredAddonsArchived += purchases.addonIds.length

		// Clear the consumed defer so the next annual cycle starts clean. For
		// holiday lists always stamp the per-occurrence idempotency mark so the
		// normal holiday pass skips this list later in the same run.
		const listUpdate: { archiveDeferUntil: null; lastHolidayArchiveAt?: Date } = { archiveDeferUntil: null }
		if (list.type === 'holiday') listUpdate.lastHolidayArchiveAt = now
		await db.update(lists).set(listUpdate).where(eq(lists.id, list.id))

		const family = await revealFamilyForList(db, list)
		if (family && (purchases.itemIds.length > 0 || purchases.addonIds.length > 0)) {
			revealed.push({
				listId: list.id,
				ownerId: list.ownerId,
				listName: list.name,
				subjectDependentId: list.subjectDependentId,
				...family,
				...purchases,
			})
		}
	}

	// === Birthday auto-archive ===
	// A birthday/wishlist list reveals after its recipient's birthday: the
	// owner's for their own lists, the dependent's for a list made for a
	// dependent. A guardian's birthday never reveals a dependent's list.
	const birthdayDate = addCalendarDays(today, -archiveDaysAfterBirthday)
	const bMonth = MONTHS[birthdayDate.getUTCMonth()]
	const bDay = birthdayDate.getUTCDate()

	// Per-list (not one bulk update across a recipient's lists) so each list
	// can be individually skipped when deferred and stamped with
	// last-archived.
	const revealBirthdayLists = async (where: SQL) => {
		const birthdayLists = await db.query.lists.findMany({
			where: and(where, eq(lists.isActive, true), inArray(lists.type, ['birthday', 'wishlist'])),
			columns: { id: true, ownerId: true, name: true, subjectDependentId: true, archiveDeferUntil: true },
		})
		for (const list of birthdayLists) {
			if (list.archiveDeferUntil && list.archiveDeferUntil.getTime() > now.getTime()) continue

			const purchases = await revealListPurchases(db, list.id, now)
			birthdayArchived += purchases.itemIds.length
			birthdayAddonsArchived += purchases.addonIds.length
			if (purchases.itemIds.length === 0 && purchases.addonIds.length === 0) continue
			revealed.push({
				listId: list.id,
				ownerId: list.ownerId,
				listName: list.name,
				subjectDependentId: list.subjectDependentId,
				family: 'birthday',
				occasion: 'birthday',
				...purchases,
			})
		}
	}

	const birthdayUsers = await db.query.users.findMany({
		where: and(eq(users.birthMonth, bMonth), eq(users.birthDay, bDay)),
		columns: { id: true },
	})
	for (const user of birthdayUsers) {
		await revealBirthdayLists(and(eq(lists.ownerId, user.id), isNull(lists.subjectDependentId))!)
	}

	const birthdayDependents = await db.query.dependents.findMany({
		where: and(eq(dependents.birthMonth, bMonth), eq(dependents.birthDay, bDay), eq(dependents.isArchived, false)),
		columns: { id: true },
	})
	for (const dependent of birthdayDependents) {
		await revealBirthdayLists(eq(lists.subjectDependentId, dependent.id))
	}

	// === Christmas auto-archive ===
	let christmasDate = new Date(Date.UTC(today.getUTCFullYear(), 11, 25))
	if (today < christmasDate) christmasDate = new Date(Date.UTC(today.getUTCFullYear() - 1, 11, 25))
	const daysSinceChristmas = Math.round((today.getTime() - christmasDate.getTime()) / (1000 * 60 * 60 * 24))

	if (daysSinceChristmas === archiveDaysAfterChristmas) {
		const christmasLists = await db.query.lists.findMany({
			where: and(eq(lists.type, 'christmas'), eq(lists.isActive, true)),
			columns: { id: true, ownerId: true, name: true, subjectDependentId: true, archiveDeferUntil: true },
		})
		for (const list of christmasLists) {
			// Deferred lists are revealed later by the deferred-due pass.
			if (list.archiveDeferUntil && list.archiveDeferUntil.getTime() > now.getTime()) continue
			const purchases = await revealListPurchases(db, list.id, now)
			christmasArchived += purchases.itemIds.length
			christmasAddonsArchived += purchases.addonIds.length
			if (purchases.itemIds.length === 0 && purchases.addonIds.length === 0) continue
			revealed.push({
				listId: list.id,
				ownerId: list.ownerId,
				listName: list.name,
				subjectDependentId: list.subjectDependentId,
				family: 'christmas',
				occasion: 'Christmas',
				...purchases,
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
			name: true,
			subjectDependentId: true,
			customHolidayId: true,
			lastHolidayArchiveAt: true,
			archiveDeferUntil: true,
		},
		with: {
			customHoliday: true,
		},
	})

	for (const list of holidayLists) {
		let occurrenceStart: Date | null = null
		let occurrenceEnd: Date | null = null

		if (!list.customHoliday) continue
		// Deferred lists are revealed later by the deferred-due pass.
		if (list.archiveDeferUntil && list.archiveDeferUntil.getTime() > now.getTime()) continue

		// For catalog-source rows, lastOccurrence still applies (rules
		// have a duration). For custom rows, the "occurrence" is a single
		// day equal to (year, month, day).
		if (list.customHoliday.source === 'catalog' && list.customHoliday.catalogCountry && list.customHoliday.catalogKey) {
			occurrenceStart = await lastOccurrence(list.customHoliday.catalogCountry, list.customHoliday.catalogKey, today, db)
			if (occurrenceStart) {
				occurrenceEnd = await endOfOccurrence(list.customHoliday.catalogCountry, list.customHoliday.catalogKey, occurrenceStart, db)
			}
		} else if (list.customHoliday.source === 'custom') {
			// Custom date: use the most recent past occurrence (or skip if
			// all are in the future).
			const next = await customHolidayNextOccurrence(list.customHoliday, today, db)
			// "Last" = the most recent past occurrence. If next-occurrence
			// is today or earlier, that's it. Otherwise back-roll one year
			// for annual recurrence.
			if (next && next.getTime() <= today.getTime()) {
				occurrenceStart = next
			} else if (next && list.customHoliday.customYear === null) {
				// Annual: previous year's occurrence.
				occurrenceStart = new Date(Date.UTC(next.getUTCFullYear() - 1, next.getUTCMonth(), next.getUTCDate()))
			}
			if (occurrenceStart) occurrenceEnd = occurrenceStart
		}

		if (!occurrenceStart || !occurrenceEnd) continue
		const cutoff = new Date(occurrenceEnd.getTime() + archiveDaysAfterHoliday * 24 * 60 * 60 * 1000)
		if (today.getTime() < cutoff.getTime()) continue
		// The stamp is an instant; compare its calendar date so a run just
		// after local midnight east of UTC (still the previous UTC date)
		// counts as having archived this occurrence.
		if (list.lastHolidayArchiveAt && calendarDayInZone(list.lastHolidayArchiveAt, timeZone).getTime() >= occurrenceStart.getTime()) continue

		const purchases = await revealListPurchases(db, list.id, now)
		holidayArchived += purchases.itemIds.length
		holidayAddonsArchived += purchases.addonIds.length
		if (purchases.itemIds.length > 0 || purchases.addonIds.length > 0) {
			revealed.push({
				listId: list.id,
				ownerId: list.ownerId,
				listName: list.name,
				subjectDependentId: list.subjectDependentId,
				family: 'holiday',
				occasion: list.customHoliday.title,
				...purchases,
			})
		}

		// Mark this occurrence handled even when nothing was revealed.
		await db.update(lists).set({ lastHolidayArchiveAt: now }).where(eq(lists.id, list.id))
	}

	const totalArchived = birthdayArchived + christmasArchived + holidayArchived + deferredArchived
	if (totalArchived > 0) itemsArchivedTotal.inc(totalArchived)
	if (birthdayArchived > 0) revealsTriggeredTotal.inc({ trigger: 'birthday' }, birthdayArchived)
	if (christmasArchived > 0) revealsTriggeredTotal.inc({ trigger: 'christmas' }, christmasArchived)
	if (holidayArchived > 0) revealsTriggeredTotal.inc({ trigger: 'holiday' }, holidayArchived)
	if (deferredArchived > 0) revealsTriggeredTotal.inc({ trigger: 'deferred' }, deferredArchived)

	return {
		birthdayArchived,
		birthdayAddonsArchived,
		christmasArchived,
		christmasAddonsArchived,
		holidayArchived,
		holidayAddonsArchived,
		deferredArchived,
		deferredAddonsArchived,
		revealed,
	}
}
