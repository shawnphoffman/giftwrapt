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
//
// Curation policy: every seeded row should be a holiday people give
// gifts on. Civic / observance days that aren't gift-occasions are
// out (Memorial Day, Labor Day, Juneteenth, MLK, Veterans Day, ANZAC
// Day, Canada Day, Bastille Day, etc.). The `rule` strings are
// `date-holidays` grammar; they're consumed only by the build-time
// `scripts/precompute-holidays.mts` generator, never at runtime, so a
// `rule` value the runtime no longer recognizes is fine as long as
// the generator can resolve it.

import { sql } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { holidayCatalog, type NewHolidayCatalogEntry } from '@/db/schema'

interface SeedEntry {
	country: string
	slug: string
	name: string
	rule: string
}

// Christmas is omitted on purpose for every country (it's a first-class
// list type with its own theming).
export const HOLIDAY_CATALOG_SEED: ReadonlyArray<SeedEntry> = [
	// =================================================================
	// US - United States
	// =================================================================
	{ country: 'US', slug: 'valentines', name: "Valentine's Day", rule: '02-14' },
	{ country: 'US', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'US', slug: 'mothers-day', name: "Mother's Day", rule: '2nd sunday in May' },
	{ country: 'US', slug: 'fathers-day', name: "Father's Day", rule: '3rd sunday in June' },
	{ country: 'US', slug: 'halloween', name: 'Halloween', rule: '10-31 18:00' },
	{ country: 'US', slug: 'thanksgiving', name: 'Thanksgiving Day', rule: '4th thursday in November' },
	// =================================================================
	// CA - Canada
	// =================================================================
	{ country: 'CA', slug: 'valentines', name: "Valentine's Day", rule: '02-14' },
	{ country: 'CA', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'CA', slug: 'mothers-day', name: "Mother's Day", rule: '2nd sunday after 05-01' },
	{ country: 'CA', slug: 'fathers-day', name: "Father's Day", rule: '3rd sunday after 06-01' },
	{ country: 'CA', slug: 'thanksgiving', name: 'Thanksgiving', rule: '2nd monday after 10-01' },
	{ country: 'CA', slug: 'halloween', name: 'Halloween', rule: '10-31 18:00' },
	{ country: 'CA', slug: 'boxing-day', name: 'Boxing Day', rule: '12-26' },
	// =================================================================
	// GB - United Kingdom
	// =================================================================
	{ country: 'GB', slug: 'valentines', name: "Valentine's Day", rule: '02-14' },
	// Mothering Sunday in the UK is "Mother's Day" but on a different
	// date (Sunday three weeks before Easter). Slug stays
	// 'mothering-sunday' so it's distinct from US 'mothers-day'.
	{ country: 'GB', slug: 'mothering-sunday', name: 'Mothering Sunday', rule: 'easter -21' },
	{ country: 'GB', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'GB', slug: 'fathers-day', name: "Father's Day", rule: '3rd sunday in June' },
	{ country: 'GB', slug: 'halloween', name: 'Halloween', rule: '10-31 18:00' },
	{ country: 'GB', slug: 'boxing-day', name: 'Boxing Day', rule: '12-26' },
	// =================================================================
	// AU - Australia
	// =================================================================
	{ country: 'AU', slug: 'valentines', name: "Valentine's Day", rule: '02-14' },
	{ country: 'AU', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'AU', slug: 'mothers-day', name: "Mother's Day", rule: '2nd sunday in May' },
	{ country: 'AU', slug: 'fathers-day', name: "Father's Day", rule: '1st sunday in September' },
	{
		country: 'AU',
		slug: 'boxing-day',
		name: 'Boxing Day',
		rule: '12-26 and if saturday then next monday if sunday then next tuesday',
	},
	// =================================================================
	// IE - Ireland
	// =================================================================
	{ country: 'IE', slug: 'valentines', name: "Valentine's Day", rule: '02-14' },
	{ country: 'IE', slug: 'st-patricks', name: "St. Patrick's Day", rule: '03-17' },
	{ country: 'IE', slug: 'mothering-sunday', name: 'Mothering Sunday', rule: 'easter -21' },
	{ country: 'IE', slug: 'easter', name: 'Easter Sunday', rule: 'easter' },
	{ country: 'IE', slug: 'fathers-day', name: "Father's Day", rule: '3rd sunday in June' },
	{ country: 'IE', slug: 'halloween', name: 'Halloween', rule: '10-31 18:00' },
	{ country: 'IE', slug: 'st-stephens', name: "St. Stephen's Day", rule: '12-26' },
	// =================================================================
	// DE - Germany
	// =================================================================
	{ country: 'DE', slug: 'valentines', name: 'Valentinstag', rule: '02-14' },
	{ country: 'DE', slug: 'easter', name: 'Ostern', rule: 'easter' },
	{ country: 'DE', slug: 'mothers-day', name: 'Muttertag', rule: '2nd sunday in May' },
	{ country: 'DE', slug: 'fathers-day', name: 'Vatertag', rule: 'easter 39' },
	{ country: 'DE', slug: 'st-nikolaus', name: 'Nikolaustag', rule: '12-06' },
	{ country: 'DE', slug: 'heiligabend', name: 'Heiligabend', rule: '12-24' },
	// =================================================================
	// FR - France
	// =================================================================
	{ country: 'FR', slug: 'epiphany', name: 'Épiphanie', rule: '01-06' },
	{ country: 'FR', slug: 'valentines', name: 'Saint-Valentin', rule: '02-14' },
	{ country: 'FR', slug: 'easter', name: 'Pâques', rule: 'easter' },
	{ country: 'FR', slug: 'mothers-day', name: 'Fête des Mères', rule: 'sunday before 06-01' },
	{ country: 'FR', slug: 'fathers-day', name: 'Fête des Pères', rule: '3rd sunday in June' },
	{ country: 'FR', slug: 'reveillon', name: 'Réveillon de Noël', rule: '12-24' },
	// =================================================================
	// IT - Italy
	// =================================================================
	{ country: 'IT', slug: 'epiphany', name: 'Epifania', rule: '01-06' },
	{ country: 'IT', slug: 'valentines', name: 'San Valentino', rule: '02-14' },
	{ country: 'IT', slug: 'fathers-day', name: 'Festa del Papà', rule: '03-19' },
	{ country: 'IT', slug: 'easter', name: 'Pasqua', rule: 'easter' },
	{ country: 'IT', slug: 'mothers-day', name: 'Festa della Mamma', rule: '2nd sunday in May' },
	{ country: 'IT', slug: 'christmas-eve', name: 'Vigilia di Natale', rule: '12-24' },
	// =================================================================
	// ES - Spain
	// =================================================================
	{ country: 'ES', slug: 'reyes-magos', name: 'Día de Reyes', rule: '01-06' },
	{ country: 'ES', slug: 'valentines', name: 'San Valentín', rule: '02-14' },
	{ country: 'ES', slug: 'fathers-day', name: 'Día del Padre', rule: '03-19' },
	{ country: 'ES', slug: 'easter', name: 'Domingo de Pascua', rule: 'easter' },
	{ country: 'ES', slug: 'mothers-day', name: 'Día de la Madre', rule: '1st sunday in May' },
	{ country: 'ES', slug: 'nochebuena', name: 'Nochebuena', rule: '12-24' },
	// =================================================================
	// NL - Netherlands
	// =================================================================
	{ country: 'NL', slug: 'valentines', name: 'Valentijnsdag', rule: '02-14' },
	{ country: 'NL', slug: 'easter', name: 'Pasen', rule: 'easter' },
	{ country: 'NL', slug: 'mothers-day', name: 'Moederdag', rule: '2nd sunday in May' },
	{ country: 'NL', slug: 'fathers-day', name: 'Vaderdag', rule: '3rd sunday in June' },
	{ country: 'NL', slug: 'sinterklaas', name: 'Sinterklaasavond', rule: '12-05' },
	// =================================================================
	// SE - Sweden
	// =================================================================
	{ country: 'SE', slug: 'valentines', name: 'Alla hjärtans dag', rule: '02-14' },
	{ country: 'SE', slug: 'easter', name: 'Påskdagen', rule: 'easter' },
	{ country: 'SE', slug: 'mothers-day', name: 'Morsdag', rule: 'sunday before 06-01' },
	{ country: 'SE', slug: 'fathers-day', name: 'Farsdag', rule: '2nd sunday in November' },
	{ country: 'SE', slug: 'lucia', name: 'Luciadagen', rule: '12-13' },
	{ country: 'SE', slug: 'christmas-eve', name: 'Julafton', rule: '12-24' },
	// =================================================================
	// MX - Mexico
	// =================================================================
	{ country: 'MX', slug: 'reyes-magos', name: 'Día de los Reyes Magos', rule: '01-06' },
	{ country: 'MX', slug: 'valentines', name: 'Día del Amor y la Amistad', rule: '02-14' },
	{ country: 'MX', slug: 'easter', name: 'Domingo de Pascua', rule: 'easter' },
	// Mexican Mother's Day is fixed on May 10 regardless of weekday.
	{ country: 'MX', slug: 'mothers-day', name: 'Día de la Madre', rule: '05-10' },
	{ country: 'MX', slug: 'fathers-day', name: 'Día del Padre', rule: '3rd sunday in June' },
	{ country: 'MX', slug: 'dia-de-muertos', name: 'Día de Muertos', rule: '11-02' },
	{ country: 'MX', slug: 'nochebuena', name: 'Nochebuena', rule: '12-24' },
	// =================================================================
	// BR - Brazil
	// =================================================================
	{ country: 'BR', slug: 'easter', name: 'Páscoa', rule: 'easter' },
	{ country: 'BR', slug: 'mothers-day', name: 'Dia das Mães', rule: '2nd sunday in May' },
	// Brazilian "Valentine's Day" is celebrated on June 12 (Dia dos
	// Namorados) rather than Feb 14.
	{ country: 'BR', slug: 'namorados', name: 'Dia dos Namorados', rule: '06-12' },
	{ country: 'BR', slug: 'fathers-day', name: 'Dia dos Pais', rule: '2nd sunday in August' },
	{ country: 'BR', slug: 'christmas-eve', name: 'Véspera de Natal', rule: '12-24' },
	// =================================================================
	// JP - Japan
	// =================================================================
	{ country: 'JP', slug: 'valentines', name: 'バレンタインデー', rule: '02-14' },
	{ country: 'JP', slug: 'white-day', name: 'ホワイトデー', rule: '03-14' },
	{ country: 'JP', slug: 'childrens-day', name: 'こどもの日', rule: '05-05' },
	{ country: 'JP', slug: 'mothers-day', name: '母の日', rule: '2nd sunday in May' },
	{ country: 'JP', slug: 'fathers-day', name: '父の日', rule: '3rd sunday in June' },
	// =================================================================
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
