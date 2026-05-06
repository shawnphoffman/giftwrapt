// Curated holiday catalog backed by the `date-holidays` library.
//
// Why curated: `date-holidays` returns dozens of entries per country
// (some `public`, many `observance`, plus religious feasts and obscure
// observances). For a gift-giving app we want a tight list of "occasions
// you might gift for", which is a much smaller subset. The allowlist
// here is the contract; new entries are added as users ask for them.
//
// Stable identifier: each catalog entry has a stable URL-safe `slug`
// (`'easter'`, `'mothers-day'`) that becomes `lists.holiday_key` in the
// DB. Internally the slug maps to the library's `rule` string, which is
// what we use to look the holiday up at runtime. If a future
// `date-holidays` version changes a rule string for one of our entries,
// the unit tests catch it.
//
// Christmas: NOT in the allowlist. `christmas` is a first-class list
// type with its own theming, cron, and emails. Picking "Christmas Day"
// inside a generic holiday list would be redundant.

import type { HolidaysTypes } from 'date-holidays'
import Holidays from 'date-holidays'

export type CountryCode = 'US' | 'CA' | 'GB' | 'AU'

const COUNTRY_CODES: ReadonlyArray<CountryCode> = ['US', 'CA', 'GB', 'AU']

export const SUPPORTED_COUNTRIES: ReadonlyArray<{ code: CountryCode; name: string }> = [
	{ code: 'US', name: 'United States' },
	{ code: 'CA', name: 'Canada' },
	{ code: 'GB', name: 'United Kingdom' },
	{ code: 'AU', name: 'Australia' },
]

interface CatalogEntry {
	slug: string
	name: string
	// Exact `rule` string from `date-holidays` for the canonical (non-
	// substitute) holiday in that country. Verified by the unit test
	// suite against the bundled library version.
	rule: string
}

const ALLOWLIST: Record<CountryCode, ReadonlyArray<CatalogEntry>> = {
	US: [
		{ slug: 'new-year', name: "New Year's Day", rule: '01-01 and if sunday then next monday if saturday then previous friday' },
		{ slug: 'mlk-day', name: 'Martin Luther King Jr. Day', rule: '3rd monday in January' },
		{ slug: 'valentines', name: "Valentine's Day", rule: '02-14' },
		{ slug: 'st-patricks', name: "St. Patrick's Day", rule: '03-17' },
		{ slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
		{ slug: 'mothers-day', name: "Mother's Day", rule: '2nd sunday in May' },
		{ slug: 'memorial-day', name: 'Memorial Day', rule: 'monday before 06-01' },
		{ slug: 'juneteenth', name: 'Juneteenth', rule: '06-19 and if sunday then next monday if saturday then previous friday since 2021' },
		{ slug: 'fathers-day', name: "Father's Day", rule: '3rd sunday in June' },
		{ slug: 'independence-day', name: 'Independence Day', rule: '07-04 and if sunday then next monday if saturday then previous friday' },
		{ slug: 'labor-day', name: 'Labor Day', rule: '1st monday in September' },
		{ slug: 'halloween', name: 'Halloween', rule: '10-31 18:00' },
		{ slug: 'veterans-day', name: 'Veterans Day', rule: '11-11' },
		{ slug: 'thanksgiving', name: 'Thanksgiving Day', rule: '4th thursday in November' },
		{ slug: 'new-years-eve', name: "New Year's Eve", rule: '12-31' },
	],
	CA: [
		{ slug: 'new-year', name: "New Year's Day", rule: '01-01' },
		{ slug: 'valentines', name: "Valentine's Day", rule: '02-14' },
		{ slug: 'st-patricks', name: "St. Patrick's Day", rule: '03-17' },
		{ slug: 'good-friday', name: 'Good Friday', rule: 'easter -2' },
		{ slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
		{ slug: 'mothers-day', name: "Mother's Day", rule: '2nd sunday after 05-01' },
		{ slug: 'fathers-day', name: "Father's Day", rule: '3rd sunday after 06-01' },
		{ slug: 'canada-day', name: 'Canada Day', rule: '07-01' },
		{ slug: 'labour-day', name: 'Labour Day', rule: '1st monday in September' },
		{ slug: 'thanksgiving', name: 'Thanksgiving', rule: '2nd monday after 10-01' },
		{ slug: 'halloween', name: 'Halloween', rule: '10-31 18:00' },
		{ slug: 'boxing-day', name: 'Boxing Day', rule: '12-26' },
	],
	GB: [
		{ slug: 'new-year', name: "New Year's Day", rule: '01-01' },
		// Mothering Sunday in the UK is "Mother's Day" but on a different
		// date (Sunday three weeks before Easter). The slug stays
		// 'mothering-sunday' so it's distinct from US 'mothers-day'.
		{ slug: 'mothering-sunday', name: 'Mothering Sunday', rule: 'easter -21' },
		{ slug: 'good-friday', name: 'Good Friday', rule: 'easter -2' },
		{ slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
		{ slug: 'easter-monday', name: 'Easter Monday', rule: 'easter 1' },
		{ slug: 'fathers-day', name: "Father's Day", rule: '3rd sunday in June' },
		{ slug: 'boxing-day', name: 'Boxing Day', rule: '12-26' },
	],
	AU: [
		{ slug: 'new-year', name: "New Year's Day", rule: '01-01 and if saturday,sunday then next monday' },
		{ slug: 'australia-day', name: 'Australia Day', rule: '01-26 if saturday,sunday then next monday' },
		{ slug: 'good-friday', name: 'Good Friday', rule: 'easter -2' },
		{ slug: 'easter-saturday', name: 'Easter Saturday', rule: 'easter -1' },
		{ slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
		{ slug: 'easter-monday', name: 'Easter Monday', rule: 'easter 1' },
		{ slug: 'anzac-day', name: 'Anzac Day', rule: '04-25' },
		{ slug: 'mothers-day', name: "Mother's Day", rule: '2nd sunday in May' },
		{ slug: 'fathers-day', name: "Father's Day", rule: '1st sunday in September' },
		{ slug: 'boxing-day', name: 'Boxing Day', rule: '12-26 and if saturday then next monday if sunday then next tuesday' },
	],
}

// `date-holidays` is mutable per-instance; cache one per country so
// repeated lookups don't re-parse the country dataset.
const instanceCache = new Map<CountryCode, Holidays>()
function getInstance(country: CountryCode): Holidays {
	let inst = instanceCache.get(country)
	if (!inst) {
		inst = new Holidays(country, { types: ['public', 'observance'] })
		instanceCache.set(country, inst)
	}
	return inst
}

export function isCountryCode(value: string): value is CountryCode {
	return (COUNTRY_CODES as ReadonlyArray<string>).includes(value)
}

function findEntry(country: string, slug: string): CatalogEntry | null {
	if (!isCountryCode(country)) return null
	return ALLOWLIST[country].find(e => e.slug === slug) ?? null
}

function findHolidayInYear(country: CountryCode, rule: string, year: number): HolidaysTypes.Holiday | null {
	const holidays = getInstance(country).getHolidays(year)
	return holidays.find(h => h.rule === rule && !h.substitute) ?? null
}

export function listCountries(): ReadonlyArray<{ code: CountryCode; name: string }> {
	return SUPPORTED_COUNTRIES
}

export interface CatalogHoliday {
	key: string
	name: string
	start: Date
	end: Date
}

// Returns the curated holiday list for a given country and year, sorted
// by start date. Empty array for unsupported countries.
export function listHolidaysFor(country: string, year: number = new Date().getFullYear()): Array<CatalogHoliday> {
	if (!isCountryCode(country)) return []
	const out: Array<CatalogHoliday> = []
	for (const entry of ALLOWLIST[country]) {
		const h = findHolidayInYear(country, entry.rule, year)
		if (!h) continue
		out.push({ key: entry.slug, name: entry.name, start: new Date(h.start), end: new Date(h.end) })
	}
	out.sort((a, b) => a.start.getTime() - b.start.getTime())
	return out
}

// Validates that (country, key) corresponds to a real catalog entry.
// Used by the API layer when accepting `lists.holidayCountry` and
// `lists.holidayKey` on create/update.
export function isValidHolidayKey(country: string, key: string): boolean {
	return findEntry(country, key) !== null
}

// Returns the start date of the next occurrence (today's occurrence if
// it hasn't ended yet, otherwise next year's). Null for unknown country
// or key.
export function nextOccurrence(country: string, key: string, now: Date = new Date()): Date | null {
	if (!isCountryCode(country)) return null
	const entry = findEntry(country, key)
	if (!entry) return null
	const year = now.getFullYear()
	const thisYear = findHolidayInYear(country, entry.rule, year)
	if (thisYear && thisYear.end.getTime() > now.getTime()) return new Date(thisYear.start)
	const nextYear = findHolidayInYear(country, entry.rule, year + 1)
	return nextYear ? new Date(nextYear.start) : null
}

// Returns the start date of the most recent occurrence whose end date
// is at or before `now`. If the current year's occurrence hasn't ended
// yet, returns last year's. Null for unknown country or key.
export function lastOccurrence(country: string, key: string, now: Date = new Date()): Date | null {
	if (!isCountryCode(country)) return null
	const entry = findEntry(country, key)
	if (!entry) return null
	const year = now.getFullYear()
	const thisYear = findHolidayInYear(country, entry.rule, year)
	if (thisYear && thisYear.end.getTime() <= now.getTime()) return new Date(thisYear.start)
	const lastYear = findHolidayInYear(country, entry.rule, year - 1)
	return lastYear ? new Date(lastYear.start) : null
}

// Returns the end date of the occurrence whose start matches the given
// year. For multi-day holidays this is later than the start; for
// single-day holidays the library returns end = start + 1 day. The cron
// archive math uses this to add `archiveDaysAfterHoliday` days.
export function endOfOccurrence(country: string, key: string, occurrenceStart: Date): Date | null {
	if (!isCountryCode(country)) return null
	const entry = findEntry(country, key)
	if (!entry) return null
	const h = findHolidayInYear(country, entry.rule, occurrenceStart.getFullYear())
	return h ? new Date(h.end) : null
}
