// Server-only. Seed data for `holiday_catalog`, idempotent.
//
// Why this lives in code instead of SQL: the seed mirrors what was
// previously the hardcoded `ALLOWLIST` const in `src/lib/holidays.ts`.
// Drizzle's `db:generate` only emits schema migrations, so the easiest
// way to ship a one-shot data seed without manual ops is a lazy
// bootstrap on the server's first read of the catalog. Re-running is a
// no-op once any rows exist.
//
// Self-host upgrade story: an existing deploy on PR1 (in-tree allowlist)
// upgrades; first request that touches the catalog fills the table
// with the same rows the const used to define. Admin can then enable,
// rename, prune, or extend.
//
// Opt-in policy: every seeded row starts disabled. Existing deploys
// that already populated the catalog under the old "enabled by default"
// policy keep whatever isEnabled state their admin curated - the seed
// only runs against an empty table, so the new default cannot
// retroactively disable anyone's catalog. Fresh deploys, however, see
// no holidays in the new-list pickers until an admin opts each one in
// (per country) from the admin catalog page.

import { sql } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { holidayCatalog, type NewHolidayCatalogEntry } from '@/db/schema'

interface SeedEntry {
	country: string
	slug: string
	name: string
	rule: string
}

// Mirrors the previous in-tree ALLOWLIST exactly. Christmas is omitted
// on purpose (it's a first-class list type with its own theming).
export const HOLIDAY_CATALOG_SEED: ReadonlyArray<SeedEntry> = [
	// US
	{
		country: 'US',
		slug: 'new-year',
		name: "New Year's Day",
		rule: '01-01 and if sunday then next monday if saturday then previous friday',
	},
	{ country: 'US', slug: 'mlk-day', name: 'Martin Luther King Jr. Day', rule: '3rd monday in January' },
	{ country: 'US', slug: 'valentines', name: "Valentine's Day", rule: '02-14' },
	{ country: 'US', slug: 'st-patricks', name: "St. Patrick's Day", rule: '03-17' },
	{ country: 'US', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'US', slug: 'mothers-day', name: "Mother's Day", rule: '2nd sunday in May' },
	{ country: 'US', slug: 'memorial-day', name: 'Memorial Day', rule: 'monday before 06-01' },
	{
		country: 'US',
		slug: 'juneteenth',
		name: 'Juneteenth',
		rule: '06-19 and if sunday then next monday if saturday then previous friday since 2021',
	},
	{ country: 'US', slug: 'fathers-day', name: "Father's Day", rule: '3rd sunday in June' },
	{
		country: 'US',
		slug: 'independence-day',
		name: 'Independence Day',
		rule: '07-04 and if sunday then next monday if saturday then previous friday',
	},
	{ country: 'US', slug: 'labor-day', name: 'Labor Day', rule: '1st monday in September' },
	{ country: 'US', slug: 'halloween', name: 'Halloween', rule: '10-31 18:00' },
	{ country: 'US', slug: 'veterans-day', name: 'Veterans Day', rule: '11-11' },
	{ country: 'US', slug: 'thanksgiving', name: 'Thanksgiving Day', rule: '4th thursday in November' },
	{ country: 'US', slug: 'new-years-eve', name: "New Year's Eve", rule: '12-31' },
	// CA
	{ country: 'CA', slug: 'new-year', name: "New Year's Day", rule: '01-01' },
	{ country: 'CA', slug: 'valentines', name: "Valentine's Day", rule: '02-14' },
	{ country: 'CA', slug: 'st-patricks', name: "St. Patrick's Day", rule: '03-17' },
	{ country: 'CA', slug: 'good-friday', name: 'Good Friday', rule: 'easter -2' },
	{ country: 'CA', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'CA', slug: 'mothers-day', name: "Mother's Day", rule: '2nd sunday after 05-01' },
	{ country: 'CA', slug: 'fathers-day', name: "Father's Day", rule: '3rd sunday after 06-01' },
	{ country: 'CA', slug: 'canada-day', name: 'Canada Day', rule: '07-01' },
	{ country: 'CA', slug: 'labour-day', name: 'Labour Day', rule: '1st monday in September' },
	{ country: 'CA', slug: 'thanksgiving', name: 'Thanksgiving', rule: '2nd monday after 10-01' },
	{ country: 'CA', slug: 'halloween', name: 'Halloween', rule: '10-31 18:00' },
	{ country: 'CA', slug: 'boxing-day', name: 'Boxing Day', rule: '12-26' },
	// GB
	{ country: 'GB', slug: 'new-year', name: "New Year's Day", rule: '01-01' },
	// Mothering Sunday in the UK is "Mother's Day" but on a different
	// date (Sunday three weeks before Easter). Slug stays
	// 'mothering-sunday' so it's distinct from US 'mothers-day'.
	{ country: 'GB', slug: 'mothering-sunday', name: 'Mothering Sunday', rule: 'easter -21' },
	{ country: 'GB', slug: 'good-friday', name: 'Good Friday', rule: 'easter -2' },
	{ country: 'GB', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'GB', slug: 'easter-monday', name: 'Easter Monday', rule: 'easter 1' },
	{ country: 'GB', slug: 'fathers-day', name: "Father's Day", rule: '3rd sunday in June' },
	{ country: 'GB', slug: 'boxing-day', name: 'Boxing Day', rule: '12-26' },
	// AU
	{ country: 'AU', slug: 'new-year', name: "New Year's Day", rule: '01-01 and if saturday,sunday then next monday' },
	{ country: 'AU', slug: 'australia-day', name: 'Australia Day', rule: '01-26 if saturday,sunday then next monday' },
	{ country: 'AU', slug: 'good-friday', name: 'Good Friday', rule: 'easter -2' },
	{ country: 'AU', slug: 'easter-saturday', name: 'Easter Saturday', rule: 'easter -1' },
	{ country: 'AU', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'AU', slug: 'easter-monday', name: 'Easter Monday', rule: 'easter 1' },
	{ country: 'AU', slug: 'anzac-day', name: 'Anzac Day', rule: '04-25' },
	{ country: 'AU', slug: 'mothers-day', name: "Mother's Day", rule: '2nd sunday in May' },
	{ country: 'AU', slug: 'fathers-day', name: "Father's Day", rule: '1st sunday in September' },
	{
		country: 'AU',
		slug: 'boxing-day',
		name: 'Boxing Day',
		rule: '12-26 and if saturday then next monday if sunday then next tuesday',
	},
	// IE
	{ country: 'IE', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'IE', slug: 'mothers-day', name: 'Mothering Sunday', rule: 'easter -21' },
	{ country: 'IE', slug: 'fathers-day', name: "Father's Day", rule: '3rd sunday in June' },
	// DE
	{ country: 'DE', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'DE', slug: 'mothers-day', name: 'Muttertag', rule: '2nd sunday in May' },
	// FR
	{ country: 'FR', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'FR', slug: 'mothers-day', name: 'Fête des Mères', rule: 'sunday before 06-01' },
	// IT
	{ country: 'IT', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'IT', slug: 'mothers-day', name: 'Festa della Mamma', rule: '2nd sunday in May' },
	// ES
	{ country: 'ES', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'ES', slug: 'mothers-day', name: 'Día de la Madre', rule: '1st sunday in May' },
	// NL
	{ country: 'NL', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'NL', slug: 'mothers-day', name: 'Moederdag', rule: '2nd sunday in May' },
	{ country: 'NL', slug: 'fathers-day', name: 'Vaderdag', rule: '3rd sunday in June' },
	// MX
	{ country: 'MX', slug: 'mothers-day', name: 'Día de la Madre', rule: '05-10' },
	// BR
	{ country: 'BR', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'BR', slug: 'mothers-day', name: 'Dia das Mães', rule: '2nd sunday in May' },
	{ country: 'BR', slug: 'fathers-day', name: 'Dia dos Pais', rule: '2nd sunday in August' },
	// ZA
	{ country: 'ZA', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'ZA', slug: 'mothers-day', name: "Mother's Day", rule: '2nd sunday in May' },
	{ country: 'ZA', slug: 'fathers-day', name: "Father's Day", rule: '3rd sunday in June' },
	// NO
	{ country: 'NO', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'NO', slug: 'mothers-day', name: 'Morsdag', rule: '2nd sunday in February' },
	{ country: 'NO', slug: 'fathers-day', name: 'Farsdag', rule: '2nd sunday in November' },
	// SE
	{ country: 'SE', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'SE', slug: 'mothers-day', name: 'Morsdag', rule: 'sunday before 06-01' },
	// DK
	{ country: 'DK', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'DK', slug: 'mothers-day', name: 'Mors Dag', rule: '2nd sunday in May' },
	// CH
	{ country: 'CH', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'CH', slug: 'mothers-day', name: 'Muttertag', rule: '2nd sunday in May' },
	// AT
	{ country: 'AT', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'AT', slug: 'mothers-day', name: 'Muttertag', rule: '2nd sunday in May' },
	// BE
	{ country: 'BE', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'BE', slug: 'mothers-day', name: 'Moederdag', rule: '2nd sunday in May' },
	// FI
	{ country: 'FI', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'FI', slug: 'mothers-day', name: 'Äitienpäivä', rule: '2nd sunday in May' },
	{ country: 'FI', slug: 'fathers-day', name: 'Isänpäivä', rule: '2nd sunday in November' },
]

// Inserts the default catalog rows iff the table is currently empty.
// The COUNT(*) probe is cheap, and `ON CONFLICT DO NOTHING` keeps the
// path idempotent. No per-process latch: tests use `withRollback`,
// which would wipe a prior seed and leave a stale latch.
export async function seedHolidayCatalogIfEmpty(dbx: SchemaDatabase): Promise<void> {
	const [{ count }] = await dbx.select({ count: sql<number>`COUNT(*)::int` }).from(holidayCatalog)
	if (count > 0) return

	const rows: Array<NewHolidayCatalogEntry> = HOLIDAY_CATALOG_SEED.map(e => ({
		country: e.country,
		slug: e.slug,
		name: e.name,
		rule: e.rule,
		// Explicit even though the column default is now `false`: the
		// opt-in policy is the whole point of the seed shape, and a
		// future schema flip shouldn't silently re-enable every row.
		isEnabled: false,
	}))
	await dbx.insert(holidayCatalog).values(rows).onConflictDoNothing()
}

// Test hook kept for the integration tests that previously needed a
// way to re-trigger seeding. Now a no-op since the seed always
// re-runs against an empty table; preserved so the test imports stay
// stable.
export function _resetHolidayCatalogSeedLatchForTesting(): void {
	// no-op
}
