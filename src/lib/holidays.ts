// Holiday catalog helpers backed by the per-deploy `holiday_catalog`
// table (see src/db/schema/holiday-catalog.ts) and the bundled
// `date-holidays` library.
//
// Two layers:
// 1. Sync, library-only helpers. Take a `rule` string and a country
//    code; compute next/last/end occurrence locally. Used by both
//    server and client (the client receives `rule` via a snapshot
//    server fn and computes dates without an extra round trip).
// 2. Async, DB-backed helpers. Resolve `(country, slug)` against the
//    catalog table. The validation path (`isValidHolidayKey`) returns
//    `true` only for ENABLED rows so admin can hide entries from
//    new-list creation. The date resolvers (`nextOccurrence` etc.)
//    accept disabled rows so existing lists pinned to a now-disabled
//    entry continue to render and auto-archive correctly.

import type { HolidaysTypes } from 'date-holidays'
import Holidays from 'date-holidays'
import { and, eq } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { db } from '@/db'
import { seedHolidayCatalogIfEmpty } from '@/db/holiday-catalog-seed'
import { holidayCatalog } from '@/db/schema'

// Display-only metadata for the supported countries. The catalog table
// stores arbitrary country codes, but these are the names the admin
// picker labels by default. Any country code in the table that isn't
// listed here is shown by its raw code.
//
// Order matters for the admin pickers - the first four are the original
// launch set and stay grouped first; the rest are sorted alphabetically
// by display name when surfaced.
export const SUPPORTED_COUNTRIES: ReadonlyArray<{ code: string; name: string }> = [
	{ code: 'US', name: 'United States' },
	{ code: 'CA', name: 'Canada' },
	{ code: 'GB', name: 'United Kingdom' },
	{ code: 'AU', name: 'Australia' },
	{ code: 'AT', name: 'Austria' },
	{ code: 'BE', name: 'Belgium' },
	{ code: 'BR', name: 'Brazil' },
	{ code: 'CH', name: 'Switzerland' },
	{ code: 'DE', name: 'Germany' },
	{ code: 'DK', name: 'Denmark' },
	{ code: 'ES', name: 'Spain' },
	{ code: 'FI', name: 'Finland' },
	{ code: 'FR', name: 'France' },
	{ code: 'IE', name: 'Ireland' },
	{ code: 'IT', name: 'Italy' },
	{ code: 'MX', name: 'Mexico' },
	{ code: 'NL', name: 'Netherlands' },
	{ code: 'NO', name: 'Norway' },
	{ code: 'SE', name: 'Sweden' },
	{ code: 'ZA', name: 'South Africa' },
]

// Per-country slug overrides for the relationship-reminder families.
// Mother's Day in the UK is on Mothering Sunday (different date and
// historical name) so the catalog stores it under `mothering-sunday`;
// the cron and widget look it up via this map rather than baking the
// override into every call site. Add entries here when a country's
// catalog slug for one of these families diverges from the default.
const MOTHERS_DAY_SLUG_BY_COUNTRY: Readonly<Record<string, string>> = {
	GB: 'mothering-sunday',
}

const FATHERS_DAY_SLUG_BY_COUNTRY: Readonly<Record<string, string>> = {}

const VALENTINES_SLUG_BY_COUNTRY: Readonly<Record<string, string>> = {}

export function mothersDaySlug(country: string): string {
	return MOTHERS_DAY_SLUG_BY_COUNTRY[country] ?? 'mothers-day'
}

export function fathersDaySlug(country: string): string {
	return FATHERS_DAY_SLUG_BY_COUNTRY[country] ?? 'fathers-day'
}

export function valentinesSlug(country: string): string {
	return VALENTINES_SLUG_BY_COUNTRY[country] ?? 'valentines'
}

// Set of country codes the bundled `date-holidays` library actually
// has data for. Computed once at module load; the library exposes its
// catalog via `Holidays.getCountries()`.
const SUPPORTED_LIBRARY_CODES: ReadonlySet<string> = (() => {
	try {
		return new Set(Object.keys(new Holidays().getCountries()))
	} catch {
		return new Set<string>()
	}
})()

// `date-holidays` is mutable per-instance; cache one per country so
// repeated lookups don't re-parse the country dataset.
const instanceCache = new Map<string, Holidays | null>()
function getInstance(country: string): Holidays | null {
	if (!isCountryCode(country)) return null
	if (instanceCache.has(country)) return instanceCache.get(country) ?? null
	let inst: Holidays | null = null
	try {
		inst = new Holidays(country, { types: ['public', 'observance'] })
	} catch {
		inst = null
	}
	instanceCache.set(country, inst)
	return inst
}

// Returns true if the given code is a known country in the bundled
// `date-holidays` library. Case-strict (uppercase) so the catalog's
// `(country, slug)` natural key stays a stable join target.
export function isCountryCode(value: string): boolean {
	if (!value || !/^[A-Z]{2}$/.test(value)) return false
	return SUPPORTED_LIBRARY_CODES.has(value)
}

function findHolidayInYear(country: string, rule: string, year: number): HolidaysTypes.Holiday | null {
	const inst = getInstance(country)
	if (!inst) return null
	const holidays = inst.getHolidays(year)
	return holidays.find(h => h.rule === rule && !h.substitute) ?? null
}

export interface CatalogHoliday {
	key: string
	name: string
	start: Date
	end: Date
}

// =====================================================================
// Sync, rule-driven date math (no DB)
// =====================================================================

// Resolves the (start, end) of the holiday in a specific year. Null if
// the rule isn't recognized or the country isn't in the library.
export function resolveOccurrenceForRule(country: string, rule: string, year: number): { start: Date; end: Date } | null {
	const h = findHolidayInYear(country, rule, year)
	if (!h) return null
	return { start: new Date(h.start), end: new Date(h.end) }
}

export function nextOccurrenceForRule(country: string, rule: string, now: Date = new Date()): Date | null {
	const year = now.getFullYear()
	const thisYear = findHolidayInYear(country, rule, year)
	if (thisYear && thisYear.end.getTime() > now.getTime()) return new Date(thisYear.start)
	const nextYear = findHolidayInYear(country, rule, year + 1)
	return nextYear ? new Date(nextYear.start) : null
}

export function lastOccurrenceForRule(country: string, rule: string, now: Date = new Date()): Date | null {
	const year = now.getFullYear()
	const thisYear = findHolidayInYear(country, rule, year)
	if (thisYear && thisYear.end.getTime() <= now.getTime()) return new Date(thisYear.start)
	const lastYear = findHolidayInYear(country, rule, year - 1)
	return lastYear ? new Date(lastYear.start) : null
}

export function endOfOccurrenceForRule(country: string, rule: string, occurrenceStart: Date): Date | null {
	const h = findHolidayInYear(country, rule, occurrenceStart.getFullYear())
	return h ? new Date(h.end) : null
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
	year: number = new Date().getFullYear(),
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
		const occ = resolveOccurrenceForRule(country, row.rule, year)
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
	return nextOccurrenceForRule(country, entry.rule, now)
}

export async function lastOccurrence(country: string, key: string, now: Date = new Date(), dbx: SchemaDatabase = db): Promise<Date | null> {
	const entry = await getCatalogEntry(country, key, dbx)
	if (!entry) return null
	return lastOccurrenceForRule(country, entry.rule, now)
}

export async function endOfOccurrence(country: string, key: string, occurrenceStart: Date, dbx: SchemaDatabase = db): Promise<Date | null> {
	const entry = await getCatalogEntry(country, key, dbx)
	if (!entry) return null
	return endOfOccurrenceForRule(country, entry.rule, occurrenceStart)
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
// client can render labels like "Easter (Apr 5, 2026)" without
// loading `date-holidays`.
export async function getHolidaySnapshot(now: Date = new Date(), dbx: SchemaDatabase = db): Promise<HolidaySnapshot> {
	await seedHolidayCatalogIfEmpty(dbx)
	const year = now.getFullYear()
	const countries = await listEnabledCountries(dbx)
	const byCountry: Record<string, Array<HolidaySnapshotEntry>> = {}
	for (const c of countries) {
		const rows = await dbx.query.holidayCatalog.findMany({
			where: and(eq(holidayCatalog.country, c.code), eq(holidayCatalog.isEnabled, true)),
			columns: { slug: true, name: true, rule: true },
		})
		const entries: Array<HolidaySnapshotEntry> = []
		for (const row of rows) {
			const occ = resolveOccurrenceForRule(c.code, row.rule, year)
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
