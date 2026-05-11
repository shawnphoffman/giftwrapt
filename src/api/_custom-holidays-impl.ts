// Server-only impl for the admin-curated custom_holidays table that
// replaces the legacy holiday_catalog admin UI. Two row shapes share
// the same table via the `source` discriminator:
//
//   - source='catalog': points at a (catalogCountry, catalogKey) pair
//     in the bundled holiday_catalog. Date math runs through
//     nextOccurrenceForRule.
//   - source='custom': fully custom (month, day, optional year).
//     customYear=null → repeats annually; set → one-time.
//
// Admin actions:
//   - list: every row + a usage count (how many lists point at it).
//   - addFromCatalog: pick from a curated inclusion set of gift-giving
//     holidays in the bundled catalog. The picker excludes anything
//     already covered as a first-class holiday (Christmas, Birthday)
//     or by relationship-reminders (Mother's, Father's, Valentine's).
//   - addCustom: title + date + repeats-annually flag.
//   - update: free edit on title/date/year for in-use rows
//     (idempotency marks reset on date change).
//   - delete: cascade affected lists to the deployment's
//     defaultListType WITHOUT clearing claims. Special-cased to bypass
//     the standard isCrossTypeMoveDestructive rule.

import { and, count, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import type { SchemaDatabase } from '@/db'
import { db as defaultDb } from '@/db'
import { customHolidays, holidayCatalog, lists } from '@/db/schema'
import { customHolidayNextOccurrence } from '@/lib/custom-holidays'
import { getAppSettings } from '@/lib/settings-loader'

// Slugs from the bundled holiday catalog that we expose in the admin
// "From catalog" picker. Excludes anything already covered first-class
// (christmas) or via relationship-reminders (mothers-day, fathers-day,
// valentines-day), and excludes purely civic days. Editable: drop a
// slug if it shouldn't appear; add one when a new gift-giving holiday
// gains support.
const CATALOG_GIFT_GIVING_INCLUSION = new Set<string>([
	'easter',
	'easter-sunday',
	'halloween',
	'thanksgiving',
	'hanukkah',
	'diwali',
	'eid-al-fitr',
	'eid-al-adha',
	'lunar-new-year',
	'chinese-new-year',
	'new-years-day',
])

export type AdminCustomHoliday = {
	id: string
	title: string
	source: 'catalog' | 'custom'
	catalogCountry: string | null
	catalogKey: string | null
	customMonth: number | null
	customDay: number | null
	customYear: number | null
	usageCount: number
	nextOccurrenceIso: string | null
	createdAt: Date
	updatedAt: Date
}

export async function listCustomHolidaysImpl(args: { dbx?: SchemaDatabase } = {}): Promise<Array<AdminCustomHoliday>> {
	const dbx = args.dbx ?? defaultDb
	const rows = await dbx.select().from(customHolidays).orderBy(customHolidays.title)
	if (rows.length === 0) return []

	// Usage counts in one round trip.
	const usageRows = await dbx
		.select({ id: lists.customHolidayId, n: count() })
		.from(lists)
		.where(
			inArray(
				lists.customHolidayId,
				rows.map(r => r.id)
			)
		)
		.groupBy(lists.customHolidayId)
	const usageById = new Map<string, number>(usageRows.map(r => [r.id as string, Number(r.n)]))

	const out: Array<AdminCustomHoliday> = []
	for (const r of rows) {
		const next = await customHolidayNextOccurrence(r, new Date(), dbx)
		out.push({
			id: r.id,
			title: r.title,
			source: r.source,
			catalogCountry: r.catalogCountry,
			catalogKey: r.catalogKey,
			customMonth: r.customMonth,
			customDay: r.customDay,
			customYear: r.customYear,
			usageCount: usageById.get(r.id) ?? 0,
			nextOccurrenceIso: next ? next.toISOString() : null,
			createdAt: r.createdAt,
			updatedAt: r.updatedAt,
		})
	}
	return out
}

export type CatalogCandidate = {
	country: string
	key: string
	name: string
}

export const ListCatalogCandidatesInputSchema = z.object({
	country: z.string().min(2).max(2),
})

// Returns catalog rows for the given country that:
//   - are in the gift-giving inclusion set, AND
//   - aren't already pinned by an existing custom_holidays row of
//     source='catalog' (so admins don't add duplicates).
export async function listCatalogCandidatesImpl(args: {
	input: z.output<typeof ListCatalogCandidatesInputSchema>
	dbx?: SchemaDatabase
}): Promise<Array<CatalogCandidate>> {
	const dbx = args.dbx ?? defaultDb
	const rows = await dbx
		.select({ country: holidayCatalog.country, key: holidayCatalog.slug, name: holidayCatalog.name })
		.from(holidayCatalog)
		.where(eq(holidayCatalog.country, args.input.country))

	const existing = await dbx
		.select({ key: customHolidays.catalogKey, country: customHolidays.catalogCountry })
		.from(customHolidays)
		.where(and(eq(customHolidays.source, 'catalog'), eq(customHolidays.catalogCountry, args.input.country)))
	const taken = new Set<string>(existing.map(r => `${r.country}:${r.key}`))

	return rows.filter(r => CATALOG_GIFT_GIVING_INCLUSION.has(r.key) && !taken.has(`${r.country}:${r.key}`))
}

export const AddCatalogCustomHolidayInputSchema = z.object({
	country: z.string().min(2).max(2),
	key: z.string().min(1).max(120),
	title: z.string().min(1).max(120).optional(), // override; defaults to catalog name
})

export type AddCustomHolidayResult =
	| { kind: 'ok'; id: string }
	| { kind: 'error'; reason: 'catalog-entry-not-found' | 'already-exists' | 'invalid-date' }

export async function addCatalogCustomHolidayImpl(args: {
	input: z.output<typeof AddCatalogCustomHolidayInputSchema>
	dbx?: SchemaDatabase
}): Promise<AddCustomHolidayResult> {
	const dbx = args.dbx ?? defaultDb
	const catalog = await dbx.query.holidayCatalog.findFirst({
		where: and(eq(holidayCatalog.country, args.input.country), eq(holidayCatalog.slug, args.input.key)),
	})
	if (!catalog) return { kind: 'error', reason: 'catalog-entry-not-found' }

	const dupe = await dbx
		.select({ id: customHolidays.id })
		.from(customHolidays)
		.where(
			and(
				eq(customHolidays.source, 'catalog'),
				eq(customHolidays.catalogCountry, args.input.country),
				eq(customHolidays.catalogKey, args.input.key)
			)
		)
		.limit(1)
	if (dupe.length > 0) return { kind: 'error', reason: 'already-exists' }

	const [inserted] = await dbx
		.insert(customHolidays)
		.values({
			title: args.input.title ?? catalog.name,
			source: 'catalog',
			catalogCountry: args.input.country,
			catalogKey: args.input.key,
		})
		.returning({ id: customHolidays.id })
	return { kind: 'ok', id: inserted.id }
}

export const AddCustomCustomHolidayInputSchema = z.object({
	title: z.string().min(1).max(120),
	month: z.number().int().min(1).max(12),
	day: z.number().int().min(1).max(31),
	year: z.number().int().min(1900).max(3000).nullable(),
	repeatsAnnually: z.boolean(),
})

export async function addCustomCustomHolidayImpl(args: {
	input: z.output<typeof AddCustomCustomHolidayInputSchema>
	dbx?: SchemaDatabase
}): Promise<AddCustomHolidayResult> {
	const dbx = args.dbx ?? defaultDb
	const { title, month, day, year, repeatsAnnually } = args.input
	// repeatsAnnually=true → ignore the year (recurs every year). false → year required.
	const effectiveYear = repeatsAnnually ? null : year
	if (!repeatsAnnually && year == null) return { kind: 'error', reason: 'invalid-date' }

	// Validate the month/day combination produces a real date for the
	// current (or supplied) year.
	const probeYear = effectiveYear ?? new Date().getUTCFullYear()
	const probe = new Date(Date.UTC(probeYear, month - 1, day))
	if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
		return { kind: 'error', reason: 'invalid-date' }
	}

	const [inserted] = await dbx
		.insert(customHolidays)
		.values({
			title,
			source: 'custom',
			customMonth: month,
			customDay: day,
			customYear: effectiveYear,
		})
		.returning({ id: customHolidays.id })
	return { kind: 'ok', id: inserted.id }
}

export const UpdateCustomHolidayInputSchema = z.object({
	id: z.string().uuid(),
	title: z.string().min(1).max(120).optional(),
	month: z.number().int().min(1).max(12).optional(),
	day: z.number().int().min(1).max(31).optional(),
	year: z.number().int().min(1900).max(3000).nullable().optional(),
})

export type UpdateCustomHolidayResult =
	| { kind: 'ok' }
	| { kind: 'error'; reason: 'not-found' | 'invalid-date' | 'cannot-edit-catalog-date' }

export async function updateCustomHolidayImpl(args: {
	input: z.output<typeof UpdateCustomHolidayInputSchema>
	dbx?: SchemaDatabase
}): Promise<UpdateCustomHolidayResult> {
	const dbx = args.dbx ?? defaultDb
	const row = await dbx.query.customHolidays.findFirst({ where: eq(customHolidays.id, args.input.id) })
	if (!row) return { kind: 'error', reason: 'not-found' }

	const update: Partial<typeof customHolidays.$inferInsert> = {}
	if (args.input.title !== undefined) update.title = args.input.title

	if (args.input.month !== undefined || args.input.day !== undefined || args.input.year !== undefined) {
		if (row.source === 'catalog') return { kind: 'error', reason: 'cannot-edit-catalog-date' }
		const month = args.input.month ?? row.customMonth ?? 1
		const day = args.input.day ?? row.customDay ?? 1
		const year = args.input.year !== undefined ? args.input.year : row.customYear
		const probeYear = year ?? new Date().getUTCFullYear()
		const probe = new Date(Date.UTC(probeYear, month - 1, day))
		if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
			return { kind: 'error', reason: 'invalid-date' }
		}
		update.customMonth = month
		update.customDay = day
		update.customYear = year
	}

	if (Object.keys(update).length === 0) return { kind: 'ok' }
	await dbx.update(customHolidays).set(update).where(eq(customHolidays.id, args.input.id))
	return { kind: 'ok' }
}

export const DeleteCustomHolidayInputSchema = z.object({
	id: z.string().uuid(),
})

export type DeleteCustomHolidayResult = { kind: 'ok'; convertedListCount: number } | { kind: 'error'; reason: 'not-found' }

// Admin-cascade delete: converts affected lists to the deployment's
// defaultListType WITHOUT clearing claims. This bypasses the normal
// isCrossTypeMoveDestructive rule (which would wipe claims on a
// holiday→wishlist conversion) because the conversion is an admin
// action, not a user move.
export async function deleteCustomHolidayImpl(args: {
	input: z.output<typeof DeleteCustomHolidayInputSchema>
	dbx?: SchemaDatabase
}): Promise<DeleteCustomHolidayResult> {
	const dbx = args.dbx ?? defaultDb
	const row = await dbx.query.customHolidays.findFirst({ where: eq(customHolidays.id, args.input.id) })
	if (!row) return { kind: 'error', reason: 'not-found' }

	const settings = await getAppSettings(dbx)
	const fallbackType = settings.defaultListType === 'todos' || settings.defaultListType === 'test' ? 'wishlist' : settings.defaultListType

	let convertedListCount = 0
	await dbx.transaction(async tx => {
		const affected = await tx.select({ id: lists.id }).from(lists).where(eq(lists.customHolidayId, args.input.id))
		if (affected.length > 0) {
			await tx
				.update(lists)
				.set({
					customHolidayId: null,
					holidayCountry: null,
					holidayKey: null,
					lastHolidayArchiveAt: null,
					// Force-convert to defaultListType. Claims are intentionally
					// NOT cleared (admin-cascade exception).
					type: fallbackType,
				})
				.where(
					inArray(
						lists.id,
						affected.map(l => l.id)
					)
				)
			convertedListCount = affected.length
		}
		await tx.delete(customHolidays).where(eq(customHolidays.id, args.input.id))
	})

	return { kind: 'ok', convertedListCount }
}

// Public read for the new-list dialog holiday picker. Returns every
// customHolidays row with its next-occurrence date pre-resolved.
export type CustomHolidayForPicker = {
	id: string
	title: string
	nextOccurrenceIso: string | null
}

export async function listCustomHolidaysForPickerImpl(args: { dbx?: SchemaDatabase } = {}): Promise<Array<CustomHolidayForPicker>> {
	const dbx = args.dbx ?? defaultDb
	const rows = await dbx.select().from(customHolidays).orderBy(customHolidays.title)
	const out: Array<CustomHolidayForPicker> = []
	for (const r of rows) {
		const next = await customHolidayNextOccurrence(r, new Date(), dbx)
		out.push({ id: r.id, title: r.title, nextOccurrenceIso: next ? next.toISOString() : null })
	}
	// Sort by next-occurrence ascending; nulls last.
	out.sort((a, b) => {
		if (a.nextOccurrenceIso && b.nextOccurrenceIso) return a.nextOccurrenceIso.localeCompare(b.nextOccurrenceIso)
		if (a.nextOccurrenceIso) return -1
		if (b.nextOccurrenceIso) return 1
		return a.title.localeCompare(b.title)
	})
	return out
}
