// Server-only impl for the /api/cron/auto-archive route. Lives outside
// the routes folder so integration tests can call it with a
// transactional `db` (per-test savepoint via `withRollback`) rather
// than going through the full route handler.
//
// The handler in `src/routes/api/cron/auto-archive.ts` is a thin
// wrapper that checks the CRON_SECRET and delegates here.

import { and, eq, inArray, isNotNull, isNull, lte } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { giftedItems, items, listAddons, lists, users } from '@/db/schema'
import type { BirthMonth } from '@/db/schema/enums'
import { customHolidayNextOccurrence } from '@/lib/custom-holidays'
import { endOfOccurrence, lastOccurrence } from '@/lib/holidays'
import { visibleItemsWhere } from '@/lib/item-visibility'
import { itemsArchivedTotal, revealsTriggeredTotal } from '@/lib/observability/metrics'

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
	deferredArchived: number
	deferredAddonsArchived: number
	// One row per list revealed by the deferred-due pass (an explicit defer
	// elapsed). The handler sends the matching per-type reveal email for each
	// via `maybeSendListRevealEmail`. Carries the list type + customHolidayId
	// so the handler picks the right email family without re-querying.
	deferredDueDetails: Array<{ listId: number; ownerId: string; name: string; type: string; customHolidayId: string | null }>
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
	let deferredArchived = 0
	let deferredAddonsArchived = 0
	const deferredDueDetails: AutoArchiveResult['deferredDueDetails'] = []

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
			isNull(lists.subjectDependentId),
			isNotNull(lists.archiveDeferUntil),
			lte(lists.archiveDeferUntil, now),
			inArray(lists.type, ['birthday', 'wishlist', 'christmas', 'holiday'])
		),
		columns: { id: true, ownerId: true, name: true, type: true, customHolidayId: true },
	})
	for (const list of dueLists) {
		const claimedItemIds = await db
			.selectDistinct({ itemId: giftedItems.itemId })
			.from(giftedItems)
			.innerJoin(items, and(eq(items.id, giftedItems.itemId), visibleItemsWhere('visible'), eq(items.listId, list.id)))
		const ids = claimedItemIds.map(r => r.itemId)
		let archivedAny = false
		if (ids.length > 0) {
			await db.update(items).set({ isArchived: true }).where(inArray(items.id, ids))
			deferredArchived += ids.length
			archivedAny = true
		}
		const archivedAddons = await db
			.update(listAddons)
			.set({ isArchived: true })
			.where(and(eq(listAddons.listId, list.id), eq(listAddons.isArchived, false)))
			.returning({ id: listAddons.id })
		deferredAddonsArchived += archivedAddons.length
		if (archivedAddons.length > 0) archivedAny = true

		// Clear the consumed defer so the next annual cycle starts clean. Stamp
		// last-archived only when something was actually revealed; for holiday
		// lists always stamp the per-occurrence idempotency mark so the normal
		// holiday pass skips this list later in the same run.
		const listUpdate: { archiveDeferUntil: null; lastArchivedAt?: Date; lastHolidayArchiveAt?: Date } = { archiveDeferUntil: null }
		if (archivedAny) listUpdate.lastArchivedAt = now
		if (list.type === 'holiday') listUpdate.lastHolidayArchiveAt = now
		await db.update(lists).set(listUpdate).where(eq(lists.id, list.id))

		if (archivedAny) {
			deferredDueDetails.push({
				listId: list.id,
				ownerId: list.ownerId,
				name: list.name,
				type: list.type,
				customHolidayId: list.customHolidayId,
			})
		}
	}

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
		// Per-list (not one bulk update across the user's lists) so each list
		// can be individually skipped when deferred and stamped with
		// last-archived.
		const userLists = await db.query.lists.findMany({
			where: and(eq(lists.ownerId, user.id), eq(lists.isActive, true), inArray(lists.type, ['birthday', 'wishlist'])),
			columns: { id: true, archiveDeferUntil: true },
		})

		for (const list of userLists) {
			if (list.archiveDeferUntil && list.archiveDeferUntil.getTime() > now.getTime()) continue

			const claimedItemIds = await db
				.selectDistinct({ itemId: giftedItems.itemId })
				.from(giftedItems)
				.innerJoin(items, and(eq(items.id, giftedItems.itemId), visibleItemsWhere('visible'), eq(items.listId, list.id)))
			const ids = claimedItemIds.map(r => r.itemId)
			let archivedAny = false
			if (ids.length > 0) {
				await db.update(items).set({ isArchived: true }).where(inArray(items.id, ids))
				birthdayArchived += ids.length
				archivedAny = true
			}

			// Addons are gifter-volunteered: the trigger date passing is enough
			// to reveal them, no claim gate. Run even when no items were
			// archived so addon-only lists still reveal on the received page.
			const archivedAddons = await db
				.update(listAddons)
				.set({ isArchived: true })
				.where(and(eq(listAddons.listId, list.id), eq(listAddons.isArchived, false)))
				.returning({ id: listAddons.id })
			birthdayAddonsArchived += archivedAddons.length
			if (archivedAddons.length > 0) archivedAny = true

			if (archivedAny) await db.update(lists).set({ lastArchivedAt: now }).where(eq(lists.id, list.id))
		}
	}

	// === Christmas auto-archive ===
	const christmasDate = new Date(now.getFullYear(), 11, 25)
	if (now < christmasDate) christmasDate.setFullYear(christmasDate.getFullYear() - 1)
	const daysSinceChristmas = Math.floor((now.getTime() - christmasDate.getTime()) / (1000 * 60 * 60 * 24))

	if (daysSinceChristmas === archiveDaysAfterChristmas) {
		const christmasLists = await db.query.lists.findMany({
			where: and(eq(lists.type, 'christmas'), eq(lists.isActive, true)),
			columns: { id: true, ownerId: true, archiveDeferUntil: true },
		})
		for (const list of christmasLists) {
			// Deferred lists are revealed later by the deferred-due pass.
			if (list.archiveDeferUntil && list.archiveDeferUntil.getTime() > now.getTime()) continue
			const claimedItemIds = await db
				.selectDistinct({ itemId: giftedItems.itemId })
				.from(giftedItems)
				.innerJoin(items, and(eq(items.id, giftedItems.itemId), visibleItemsWhere('visible'), eq(items.listId, list.id)))
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
			await db.update(lists).set({ lastArchivedAt: now }).where(eq(lists.id, list.id))
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
			.innerJoin(items, and(eq(items.id, giftedItems.itemId), visibleItemsWhere('visible'), eq(items.listId, list.id)))

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

		const archivedAny = ids.length > 0 || archivedAddons.length > 0
		if (archivedAny) {
			holidayArchivedDetails.push({
				listId: list.id,
				ownerId: list.ownerId,
				holidayName: list.customHoliday.title,
				itemCount: ids.length,
				addonCount: archivedAddons.length,
			})
		}

		const holidayUpdate: { lastHolidayArchiveAt: Date; lastArchivedAt?: Date } = { lastHolidayArchiveAt: now }
		if (archivedAny) holidayUpdate.lastArchivedAt = now
		await db.update(lists).set(holidayUpdate).where(eq(lists.id, list.id))
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
		christmasArchivedDetails,
		holidayArchivedDetails,
		deferredArchived,
		deferredAddonsArchived,
		deferredDueDetails,
	}
}
