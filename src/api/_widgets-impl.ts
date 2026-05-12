// Server-only impls for widget data feeds. Lives in a separate file from
// `widgets.ts` so server-only side-effecting imports stay out of the
// client bundle. `widgets.ts` only references these from inside server-fn
// handler / inputValidator bodies, which TanStack Start strips on the
// client.

import { and, arrayOverlaps, eq, inArray, max, or, sql } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { db } from '@/db'
import {
	customHolidays,
	dependentGuardianships,
	giftedItems,
	guardianships,
	items,
	listEditors,
	lists,
	userRelationships,
	users,
} from '@/db/schema'
import { customHolidayNextOccurrence, type CustomHolidayRow } from '@/lib/custom-holidays'
import { getCatalogEntry, nextOccurrence } from '@/lib/holidays'

// =====================================================================
// Public types
// =====================================================================

export type HolidayWidgetRecipient =
	| { kind: 'user'; id: string; name: string | null; image: string | null }
	| { kind: 'dependent'; id: string; name: string; image: string | null }

export type HolidayWidgetRow = {
	listId: number
	listName: string
	recipient: HolidayWidgetRecipient
	ownedByMe: boolean
	// Country / key are populated only when the row resolves through the
	// bundled `date-holidays` catalog (either a legacy
	// `lists.holidayCountry/holidayKey` pair, or a `custom_holidays` row
	// with `source = 'catalog'`). They are null for fully custom
	// admin-curated dates (`source = 'custom'`), which carry no catalog
	// reference. iOS strips both fields at the wire layer; the web
	// collection consumes neither, so callers should treat them as
	// debug-only.
	holidayCountry: string | null
	holidayKey: string | null
	holidayName: string
	occurrenceStart: string
	daysUntil: number
	lastGiftedAt: string | null
}

export type GetUpcomingHolidaysArgs = {
	userId: string
	horizonDays: number
	now?: Date
	dbx?: SchemaDatabase
	limit?: number
}

const DEFAULT_LIMIT = 50

// Universe = holiday-typed lists I can see, expanded via the four axes:
//   - my own (ownerId = me)
//   - any public list (default-allow; explicit `none` overrides drop the row)
//   - lists I'm a `listEditors` row on
//   - dependent-subject lists where I'm a guardian of the subject
//   - lists owned by a child user I'm guardian of
//
// The SQL `OR` already encodes the grant; we only need the
// `userRelationships.accessLevel = 'none'` per-owner deny set to filter
// the "public" branch back down. We don't run the full `canViewList`
// predicate per-row because it doesn't have an editor branch for
// private lists, which would drop legitimate editor / dependent-guardian
// rows.
export async function getUpcomingHolidaysImpl(args: GetUpcomingHolidaysArgs): Promise<Array<HolidayWidgetRow>> {
	const { userId, horizonDays, now = new Date(), dbx = db, limit = DEFAULT_LIMIT } = args

	if (horizonDays < 0) return []

	const me = await dbx.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { partnerId: true },
	})
	const gifterIds: Array<string> = me?.partnerId ? [userId, me.partnerId] : [userId]

	// Sub-universes that can grant visibility on a list. Combined with an
	// `OR` so a single list only shows up once even if multiple grants apply.
	const editorListIds = new Set(
		(await dbx.select({ listId: listEditors.listId }).from(listEditors).where(eq(listEditors.userId, userId))).map(r => r.listId)
	)

	const guardedDependentIds = new Set(
		(
			await dbx
				.select({ dependentId: dependentGuardianships.dependentId })
				.from(dependentGuardianships)
				.where(eq(dependentGuardianships.guardianUserId, userId))
		).map(r => r.dependentId)
	)

	const guardedChildOwnerIds = new Set(
		(await dbx.select({ childUserId: guardianships.childUserId }).from(guardianships).where(eq(guardianships.parentUserId, userId))).map(
			r => r.childUserId
		)
	)

	const deniedOwnerIds = new Set(
		(
			await dbx
				.select({ ownerUserId: userRelationships.ownerUserId })
				.from(userRelationships)
				.where(and(eq(userRelationships.viewerUserId, userId), eq(userRelationships.accessLevel, 'none')))
		).map(r => r.ownerUserId)
	)

	const visibilityClauses = [
		eq(lists.ownerId, userId),
		eq(lists.isPrivate, false),
		editorListIds.size > 0 ? inArray(lists.id, Array.from(editorListIds)) : undefined,
		guardedDependentIds.size > 0 ? inArray(lists.subjectDependentId, Array.from(guardedDependentIds)) : undefined,
		guardedChildOwnerIds.size > 0 ? inArray(lists.ownerId, Array.from(guardedChildOwnerIds)) : undefined,
	].filter((c): c is NonNullable<typeof c> => c !== undefined)

	const candidates = await dbx
		.select({
			id: lists.id,
			name: lists.name,
			ownerId: lists.ownerId,
			subjectDependentId: lists.subjectDependentId,
			isPrivate: lists.isPrivate,
			isActive: lists.isActive,
			holidayCountry: lists.holidayCountry,
			holidayKey: lists.holidayKey,
			customHolidayId: lists.customHolidayId,
			lastHolidayArchiveAt: lists.lastHolidayArchiveAt,
			ownerName: sql<string | null>`owner.name`,
			ownerImage: sql<string | null>`owner.image`,
			dependentName: sql<string | null>`dep.name`,
			dependentImage: sql<string | null>`dep.image`,
		})
		.from(lists)
		.innerJoin(sql`users as owner`, sql`owner.id = ${lists.ownerId}`)
		.leftJoin(sql`dependents as dep`, sql`dep.id = ${lists.subjectDependentId}`)
		.where(and(eq(lists.type, 'holiday'), eq(lists.isActive, true), or(...visibilityClauses)))

	if (candidates.length === 0) return []

	// Batch-load the referenced `custom_holidays` rows. Each list resolves
	// its occurrence and display name through this row when present
	// (`source = 'catalog'` runs through the bundled rule helpers,
	// `source = 'custom'` reads the stored month/day/year directly). Lists
	// without a `customHolidayId` fall back to the legacy
	// `holidayCountry`/`holidayKey` pair below.
	const customHolidayIds = Array.from(new Set(candidates.map(c => c.customHolidayId).filter((id): id is string => Boolean(id))))
	const customHolidayById = new Map<string, CustomHolidayRow>()
	if (customHolidayIds.length > 0) {
		const rows = await dbx.select().from(customHolidays).where(inArray(customHolidays.id, customHolidayIds))
		for (const row of rows) customHolidayById.set(row.id, row)
	}

	// Resolve last-gifted-at per recipient. For user recipients, key off
	// `lists.ownerId`; for dependent recipients, key off
	// `lists.subjectDependentId`. Both queries use the partner-credit
	// predicate (mirrors purchases.ts) so partner / co-gifter claims count.
	const userRecipientIds = Array.from(new Set(candidates.filter(c => !c.subjectDependentId).map(c => c.ownerId)))
	const dependentRecipientIds = Array.from(new Set(candidates.map(c => c.subjectDependentId).filter((id): id is string => Boolean(id))))

	const claimGifterFilter = or(inArray(giftedItems.gifterId, gifterIds), arrayOverlaps(giftedItems.additionalGifterIds, gifterIds))

	const lastGiftedByOwner = new Map<string, Date | null>()
	if (userRecipientIds.length > 0) {
		const rows = await dbx
			.select({
				ownerId: lists.ownerId,
				lastGiftedAt: max(giftedItems.createdAt),
			})
			.from(giftedItems)
			.innerJoin(items, eq(items.id, giftedItems.itemId))
			.innerJoin(lists, eq(lists.id, items.listId))
			.where(and(inArray(lists.ownerId, userRecipientIds), sql`${lists.subjectDependentId} IS NULL`, claimGifterFilter))
			.groupBy(lists.ownerId)
		for (const row of rows) lastGiftedByOwner.set(row.ownerId, row.lastGiftedAt)
	}

	const lastGiftedByDependent = new Map<string, Date | null>()
	if (dependentRecipientIds.length > 0) {
		const rows = await dbx
			.select({
				subjectDependentId: lists.subjectDependentId,
				lastGiftedAt: max(giftedItems.createdAt),
			})
			.from(giftedItems)
			.innerJoin(items, eq(items.id, giftedItems.itemId))
			.innerJoin(lists, eq(lists.id, items.listId))
			.where(and(inArray(lists.subjectDependentId, dependentRecipientIds), claimGifterFilter))
			.groupBy(lists.subjectDependentId)
		for (const row of rows) {
			if (row.subjectDependentId) lastGiftedByDependent.set(row.subjectDependentId, row.lastGiftedAt)
		}
	}

	// Memoize (country, key) -> name lookups against the catalog table.
	// Includes disabled entries so existing lists pinned to a now-hidden
	// holiday continue to appear in the widget.
	const nameCache = new Map<string, string | null>()
	async function resolveHolidayName(country: string, key: string): Promise<string | null> {
		const cacheKey = `${country}:${key}`
		if (nameCache.has(cacheKey)) return nameCache.get(cacheKey) ?? null
		const entry = await getCatalogEntry(country, key, dbx)
		const name = entry?.name ?? null
		nameCache.set(cacheKey, name)
		return name
	}

	// Anchor daysUntil to UTC calendar days so the legacy `date-holidays`
	// path (local-midnight Date objects) and the new `custom_holidays`
	// path (UTC-midnight Date objects) agree on what "today" means
	// regardless of the server's local timezone. Both paths produce dates
	// whose UTC-component date matches the intended calendar day; using
	// UTC getters keeps the calendar-day math TZ-invariant.
	const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

	const rows: Array<HolidayWidgetRow> = []
	for (const c of candidates) {
		const customHoliday = c.customHolidayId ? (customHolidayById.get(c.customHolidayId) ?? null) : null

		// A list reaches the widget through one of two paths:
		//   1. `customHolidayId` points at an admin-curated `custom_holidays`
		//      row (preferred; mirrors the auto-archive cron's resolution).
		//   2. Legacy `holidayCountry` + `holidayKey` pair on `lists` (kept
		//      for rows that haven't been migrated to a custom_holidays row).
		// Rows with neither path resolvable are silently skipped: the list
		// is misconfigured and there's no occurrence to show.
		if (!customHoliday && (!c.holidayCountry || !c.holidayKey)) continue

		// A row is "directly authorized" when the SQL universe placed it via
		// owner / editor / dependent-guardian / child-guardian. The "public"
		// branch (anyone-with-isPrivate=false) needs the explicit-deny check
		// before we trust it.
		const isDirectlyAuthorized =
			c.ownerId === userId ||
			editorListIds.has(c.id) ||
			(c.subjectDependentId !== null && guardedDependentIds.has(c.subjectDependentId)) ||
			guardedChildOwnerIds.has(c.ownerId)
		if (!isDirectlyAuthorized) {
			if (c.isPrivate) continue
			if (deniedOwnerIds.has(c.ownerId)) continue
			// Dependent-subject privacy inherits from EVERY guardian: a
			// 'none' from any single guardian denies the viewer.
			if (c.subjectDependentId) {
				const guardianRows = await dbx
					.select({ guardianUserId: dependentGuardianships.guardianUserId })
					.from(dependentGuardianships)
					.where(eq(dependentGuardianships.dependentId, c.subjectDependentId))
				const blocked = guardianRows.some(g => deniedOwnerIds.has(g.guardianUserId))
				if (blocked) continue
			}
		}

		// Resolve next occurrence + display name + (best-effort) catalog
		// reference pair. The catalog reference is null for source='custom'
		// rows because they don't have one; iOS strips it before delivery
		// either way.
		let occurrence: Date | null = null
		let holidayName: string | null = null
		let detailCountry: string | null = null
		let detailKey: string | null = null

		if (customHoliday) {
			occurrence = await customHolidayNextOccurrence(customHoliday, now, dbx)
			holidayName = customHoliday.title
			if (customHoliday.source === 'catalog') {
				detailCountry = customHoliday.catalogCountry
				detailKey = customHoliday.catalogKey
			}
		} else if (c.holidayCountry && c.holidayKey) {
			occurrence = await nextOccurrence(c.holidayCountry, c.holidayKey, now, dbx)
			holidayName = await resolveHolidayName(c.holidayCountry, c.holidayKey)
			detailCountry = c.holidayCountry
			detailKey = c.holidayKey
		}

		if (!occurrence || !holidayName) continue

		// Skip occurrences the auto-archive cron already processed for this
		// list so we don't double-remind through the year wrap.
		if (c.lastHolidayArchiveAt && c.lastHolidayArchiveAt.getTime() >= occurrence.getTime()) continue

		const occurrenceStart = Date.UTC(occurrence.getUTCFullYear(), occurrence.getUTCMonth(), occurrence.getUTCDate())
		const daysUntil = Math.round((occurrenceStart - todayStart) / 86_400_000)
		if (daysUntil < 0 || daysUntil > horizonDays) continue

		const recipient: HolidayWidgetRecipient = c.subjectDependentId
			? { kind: 'dependent', id: c.subjectDependentId, name: c.dependentName ?? '', image: c.dependentImage }
			: { kind: 'user', id: c.ownerId, name: c.ownerName, image: c.ownerImage }

		const lastGiftedAt = c.subjectDependentId
			? (lastGiftedByDependent.get(c.subjectDependentId) ?? null)
			: (lastGiftedByOwner.get(c.ownerId) ?? null)

		rows.push({
			listId: c.id,
			listName: c.name,
			recipient,
			ownedByMe: c.ownerId === userId,
			holidayCountry: detailCountry,
			holidayKey: detailKey,
			holidayName,
			occurrenceStart: occurrence.toISOString(),
			daysUntil,
			lastGiftedAt: lastGiftedAt instanceof Date ? lastGiftedAt.toISOString() : lastGiftedAt,
		})
	}

	rows.sort((a, b) => a.daysUntil - b.daysUntil || a.listName.localeCompare(b.listName))
	return rows.slice(0, limit)
}
