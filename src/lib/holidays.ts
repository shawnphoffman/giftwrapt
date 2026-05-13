// Holiday catalog helpers backed by the per-deploy `holiday_catalog`
// table (see src/db/schema/holiday-catalog.ts) and a pre-computed
// static table of occurrences (src/lib/holiday-occurrences.generated.ts).
//
// History: this module used to wrap the `date-holidays` library
// directly. That library was 10 MB on disk and pulled into the client
// bundle whenever any client component imported `SUPPORTED_COUNTRIES`,
// blowing through the Docker build's 4 GB heap. We now keep
// `date-holidays` as a devDependency only: `scripts/precompute-
// holidays.ts` resolves every seed entry's rule for a 10-year window
// at build time and emits a static table. The runtime reads that
// table; no rule parser ships in the production bundle.
//
// Two layers:
// 1. Sync, slug-based helpers. Take (country, slug) and look up the
//    next/last/end occurrence from the static table. Used by both
//    server and client (the client receives a snapshot via a server
//    fn and renders dates without any extra dependency).
// 2. Async, DB-backed helpers. Resolve `(country, slug)` against the
//    catalog table. The validation path (`isValidHolidayKey`) returns
//    `true` only for ENABLED rows so admin can hide entries from
//    new-list creation. The date resolvers (`nextOccurrence` etc.)
//    accept disabled rows so existing lists pinned to a now-disabled
//    entry continue to render and auto-archive correctly.

import { and, eq } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { db } from '@/db'
import { seedHolidayCatalogIfEmpty } from '@/db/holiday-catalog-seed'
import { holidayCatalog } from '@/db/schema'
import { HOLIDAY_OCCURRENCES, type HolidayOccurrenceEntry } from '@/lib/holiday-occurrences.generated'
import { SUPPORTED_COUNTRIES } from '@/lib/holidays-countries'

export { SUPPORTED_COUNTRIES }

// Per-country slug overrides for the relationship-reminder families.
// Mother's Day in the UK is on Mothering Sunday (different date and
// historical name) so the catalog stores it under `mothering-sunday`;
// the cron and widget look it up via this map rather than baking the
// override into every call site. Add entries here when a country's
// catalog slug for one of these families diverges from the default.
const MOTHERS_DAY_SLUG_BY_COUNTRY: Readonly<Record<string, string>> = {
	GB: 'mothering-sunday',
	IE: 'mothering-sunday',
}

const FATHERS_DAY_SLUG_BY_COUNTRY: Readonly<Record<string, string>> = {}

const VALENTINES_SLUG_BY_COUNTRY: Readonly<Record<string, string>> = {
	BR: 'namorados',
}

export function mothersDaySlug(country: string): string {
	return MOTHERS_DAY_SLUG_BY_COUNTRY[country] ?? 'mothers-day'
}

export function fathersDaySlug(country: string): string {
	return FATHERS_DAY_SLUG_BY_COUNTRY[country] ?? 'fathers-day'
}

export function valentinesSlug(country: string): string {
	return VALENTINES_SLUG_BY_COUNTRY[country] ?? 'valentines'
}

// Country codes the static occurrences table actually has data for.
// Anything else is rejected by `isCountryCode` so callers can't pin a
// list to a country we don't pre-compute occurrences for.
const SUPPORTED_COUNTRY_CODES: ReadonlySet<string> = new Set(SUPPORTED_COUNTRIES.map(c => c.code))

export function isCountryCode(value: string): boolean {
	if (!value || !/^[A-Z]{2}$/.test(value)) return false
	return SUPPORTED_COUNTRY_CODES.has(value)
}

// Index the generated table by `${country}/${slug}` for O(1) lookups.
const OCCURRENCE_INDEX: ReadonlyMap<string, HolidayOccurrenceEntry> = (() => {
	const m = new Map<string, HolidayOccurrenceEntry>()
	for (const entry of HOLIDAY_OCCURRENCES) {
		m.set(`${entry.country}/${entry.slug}`, entry)
	}
	return m
})()

function getOccurrenceEntry(country: string, slug: string): HolidayOccurrenceEntry | null {
	return OCCURRENCE_INDEX.get(`${country}/${slug}`) ?? null
}

export interface CatalogHoliday {
	key: string
	name: string
	start: Date
	end: Date
}

// =====================================================================
// Sync, slug-driven date math (no DB, no library)
// =====================================================================

// Resolves the (start, end) of the holiday in a specific year. Null if
// the slug isn't known or the year is outside the pre-computed window.
export function resolveOccurrence(country: string, slug: string, year: number): { start: Date; end: Date } | null {
	const entry = getOccurrenceEntry(country, slug)
	if (!entry) return null
	const occ = entry.occurrences[year]
	if (!occ) return null
	return { start: new Date(occ.start), end: new Date(occ.end) }
}

// Returns the next future occurrence start (>= now). Walks forward
// year by year inside the pre-computed window; returns null when the
// window is exhausted.
export function nextOccurrenceBySlug(country: string, slug: string, now: Date = new Date()): Date | null {
	const entry = getOccurrenceEntry(country, slug)
	if (!entry) return null
	const startYear = now.getUTCFullYear()
	const years = Object.keys(entry.occurrences)
		.map(y => Number.parseInt(y, 10))
		.filter(y => Number.isFinite(y) && y >= startYear)
		.sort((a, b) => a - b)
	for (const year of years) {
		const occ = entry.occurrences[year]
		if (!occ) continue
		if (new Date(occ.end).getTime() > now.getTime()) return new Date(occ.start)
	}
	return null
}

// Returns the most-recent past occurrence start (end <= now). Walks
// backward year by year; returns null when the window is exhausted.
export function lastOccurrenceBySlug(country: string, slug: string, now: Date = new Date()): Date | null {
	const entry = getOccurrenceEntry(country, slug)
	if (!entry) return null
	const startYear = now.getUTCFullYear()
	const years = Object.keys(entry.occurrences)
		.map(y => Number.parseInt(y, 10))
		.filter(y => Number.isFinite(y) && y <= startYear)
		.sort((a, b) => b - a)
	for (const year of years) {
		const occ = entry.occurrences[year]
		if (!occ) continue
		if (new Date(occ.end).getTime() <= now.getTime()) return new Date(occ.start)
	}
	return null
}

export function endOfOccurrenceBySlug(country: string, slug: string, occurrenceStart: Date): Date | null {
	const entry = getOccurrenceEntry(country, slug)
	if (!entry) return null
	const occ = entry.occurrences[occurrenceStart.getUTCFullYear()]
	return occ ? new Date(occ.end) : null
}

// =====================================================================
// Async, DB-backed catalog helpers
// =====================================================================

interface CatalogRow {
	country: string
	slug: string
	name: string
	rule: string
	isEnabled: boolean
}

// Returns the catalog row regardless of `isEnabled`. The cron and the
// widget name resolver use this so existing lists pinned to a disabled
// entry keep working.
export async function getCatalogEntry(country: string, slug: string, dbx: SchemaDatabase = db): Promise<CatalogRow | null> {
	await seedHolidayCatalogIfEmpty(dbx)
	const row = await dbx.query.holidayCatalog.findFirst({
		where: and(eq(holidayCatalog.country, country), eq(holidayCatalog.slug, slug)),
		columns: { country: true, slug: true, name: true, rule: true, isEnabled: true },
	})
	return row ?? null
}

// Returns the country codes that have at least one enabled catalog
// entry, intersected with the launch country list when present so the
// UI gets the friendly name.
export async function listEnabledCountries(dbx: SchemaDatabase = db): Promise<Array<{ code: string; name: string }>> {
	await seedHolidayCatalogIfEmpty(dbx)
	const rows = await dbx.selectDistinct({ country: holidayCatalog.country }).from(holidayCatalog).where(eq(holidayCatalog.isEnabled, true))
	const known = new Map(SUPPORTED_COUNTRIES.map(c => [c.code, c.name]))
	const out: Array<{ code: string; name: string }> = []
	for (const r of rows) out.push({ code: r.country, name: known.get(r.country) ?? r.country })
	out.sort((a, b) => a.name.localeCompare(b.name))
	return out
}

// Returns enabled catalog entries for a country with computed
// (start, end) for the given year. Empty when no entries are enabled.
export async function listHolidaysFor(
	country: string,
	year: number = new Date().getUTCFullYear(),
	dbx: SchemaDatabase = db
): Promise<Array<CatalogHoliday>> {
	if (!isCountryCode(country)) return []
	await seedHolidayCatalogIfEmpty(dbx)
	const rows = await dbx.query.holidayCatalog.findMany({
		where: and(eq(holidayCatalog.country, country), eq(holidayCatalog.isEnabled, true)),
		columns: { slug: true, name: true, rule: true },
	})
	const out: Array<CatalogHoliday> = []
	for (const row of rows) {
		const occ = resolveOccurrence(country, row.slug, year)
		if (!occ) continue
		out.push({ key: row.slug, name: row.name, start: occ.start, end: occ.end })
	}
	out.sort((a, b) => a.start.getTime() - b.start.getTime())
	return out
}

// Validates that (country, key) corresponds to an enabled catalog
// entry. Used by the create/update list paths. Disabled entries fail
// here so admin can stop new lists from being created against a
// hidden holiday.
export async function isValidHolidayKey(country: string, key: string, dbx: SchemaDatabase = db): Promise<boolean> {
	const entry = await getCatalogEntry(country, key, dbx)
	return entry?.isEnabled === true
}

// =====================================================================
// Date resolvers that read from the catalog table
// =====================================================================

export async function nextOccurrence(country: string, key: string, now: Date = new Date(), dbx: SchemaDatabase = db): Promise<Date | null> {
	const entry = await getCatalogEntry(country, key, dbx)
	if (!entry) return null
	return nextOccurrenceBySlug(country, key, now)
}

export async function lastOccurrence(country: string, key: string, now: Date = new Date(), dbx: SchemaDatabase = db): Promise<Date | null> {
	const entry = await getCatalogEntry(country, key, dbx)
	if (!entry) return null
	return lastOccurrenceBySlug(country, key, now)
}

export async function endOfOccurrence(country: string, key: string, occurrenceStart: Date, dbx: SchemaDatabase = db): Promise<Date | null> {
	const entry = await getCatalogEntry(country, key, dbx)
	if (!entry) return null
	return endOfOccurrenceBySlug(country, key, occurrenceStart)
}

// =====================================================================
// Snapshot for client-side pickers
// =====================================================================

export interface HolidaySnapshotEntry {
	key: string
	name: string
	rule: string
	start: string
	end: string
}

export interface HolidaySnapshot {
	year: number
	countries: Array<{ code: string; name: string }>
	byCountry: Record<string, Array<HolidaySnapshotEntry>>
}

// Single round-trip data shape for the new-list pickers. Computes the
// (start, end) for each enabled entry against the current year so the
// client can render labels like "Easter (Apr 5, 2026)" without loading
// any holiday library.
export async function getHolidaySnapshot(now: Date = new Date(), dbx: SchemaDatabase = db): Promise<HolidaySnapshot> {
	await seedHolidayCatalogIfEmpty(dbx)
	const year = now.getUTCFullYear()
	const countries = await listEnabledCountries(dbx)
	const byCountry: Record<string, Array<HolidaySnapshotEntry>> = {}
	for (const c of countries) {
		const rows = await dbx.query.holidayCatalog.findMany({
			where: and(eq(holidayCatalog.country, c.code), eq(holidayCatalog.isEnabled, true)),
			columns: { slug: true, name: true, rule: true },
		})
		const entries: Array<HolidaySnapshotEntry> = []
		for (const row of rows) {
			const occ = resolveOccurrence(c.code, row.slug, year)
			if (!occ) continue
			entries.push({
				key: row.slug,
				name: row.name,
				rule: row.rule,
				start: occ.start.toISOString(),
				end: occ.end.toISOString(),
			})
		}
		entries.sort((a, b) => a.start.localeCompare(b.start))
		byCountry[c.code] = entries
	}
	return { year, countries, byCountry }
}
