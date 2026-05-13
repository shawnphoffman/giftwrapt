/**
 * Build-time generator for `src/lib/holiday-occurrences.generated.ts`.
 *
 * The runtime no longer depends on `date-holidays` — instead, this
 * script reads the curated `HOLIDAY_CATALOG_SEED` and resolves each
 * entry's rule for a window of years (currentYear-1 through
 * currentYear+HORIZON_YEARS-2), emitting a static lookup table.
 *
 * Run via `pnpm holidays:generate`. The generated file is committed
 * to the repo so CI / Docker builds don't need to execute the script.
 * A regression test
 * (`src/lib/__tests__/holiday-occurrences.generated.test.ts`) fails
 * when the horizon end is fewer than `MIN_FUTURE_YEARS` years ahead,
 * forcing a re-run before each release if the table goes stale.
 *
 * Rule resolution uses `date-holidays`'s parser via `setHoliday(rule)`
 * on a fresh instance per entry, with `timezone: 'UTC'`. We don't rely
 * on the library's bundled country data — many of our gift-giving
 * holidays aren't in it (e.g. Valentine's Day in JP), and we want
 * stable UTC-anchored output regardless of host timezone.
 *
 * `date-holidays` stays a devDependency so this script can find it,
 * but it never reaches the production bundle.
 */

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Holidays from 'date-holidays'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

import { HOLIDAY_CATALOG_SEED } from '../src/db/holiday-catalog-seed'

const HORIZON_YEARS = 10 // covers currentYear-1 .. currentYear+HORIZON_YEARS-2 (10 total)

interface ResolvedOccurrence {
	start: string
	end: string
}

interface GeneratedEntry {
	country: string
	slug: string
	name: string
	rule: string
	occurrences: Record<number, ResolvedOccurrence>
}

function resolveOccurrence(rule: string, year: number): ResolvedOccurrence | null {
	// Construct with a placeholder country just to bootstrap timezone
	// handling, then wipe the bundled rules so we resolve only our own.
	const inst = new Holidays('US', { timezone: 'UTC' })
	;(inst as unknown as { holidays: Record<string, unknown> }).holidays = {}
	inst.setHoliday(rule, { name: { en: '_' }, type: 'observance' })
	const all = inst.getHolidays(year)
	const hit = all.find(h => h.rule === rule)
	if (!hit) return null
	return {
		start: new Date(hit.start).toISOString(),
		end: new Date(hit.end).toISOString(),
	}
}

function main(): void {
	const now = new Date()
	const startYear = now.getUTCFullYear() - 1
	const endYear = now.getUTCFullYear() + HORIZON_YEARS - 2 // inclusive

	const entries: Array<GeneratedEntry> = []
	const failures: Array<string> = []

	for (const seed of HOLIDAY_CATALOG_SEED) {
		const occurrences: Record<number, ResolvedOccurrence> = {}
		for (let year = startYear; year <= endYear; year++) {
			const occ = resolveOccurrence(seed.rule, year)
			if (occ) occurrences[year] = occ
		}
		if (Object.keys(occurrences).length === 0) {
			failures.push(`${seed.country}/${seed.slug} (rule="${seed.rule}")`)
			continue
		}
		entries.push({
			country: seed.country,
			slug: seed.slug,
			name: seed.name,
			rule: seed.rule,
			occurrences,
		})
	}

	if (failures.length > 0) {
		console.error('Failed to resolve occurrences for:', failures)
		process.exit(1)
	}

	const generatedAt = now.toISOString()
	const banner = `// AUTO-GENERATED via \`pnpm holidays:generate\`. Do not edit by hand.
//
// Source: src/db/holiday-catalog-seed.ts
// Generator: scripts/precompute-holidays.ts
// Generated at: ${generatedAt}
// Year coverage: ${startYear}..${endYear} (inclusive)
//
// The runtime resolves (country, slug) -> next/last/end occurrences
// via this table; it does NOT depend on the \`date-holidays\` library.
// To extend the horizon or refresh after a seed change, run the
// generator script and commit the new file.
//`

	const body = `${banner}

export const HOLIDAY_OCCURRENCES_GENERATED_AT = ${JSON.stringify(generatedAt)} as const
export const HOLIDAY_OCCURRENCES_FIRST_YEAR = ${startYear} as const
export const HOLIDAY_OCCURRENCES_LAST_YEAR = ${endYear} as const

export interface HolidayOccurrenceEntry {
	country: string
	slug: string
	name: string
	rule: string
	// Year -> ISO start / end timestamps. Missing years are valid (e.g.
	// "since YYYY" rules); callers handle gaps. Modeled as Partial so
	// the typechecker forces an undefined-check at every lookup.
	occurrences: Readonly<Partial<Record<number, Readonly<{ start: string; end: string }>>>>
}

export const HOLIDAY_OCCURRENCES: ReadonlyArray<HolidayOccurrenceEntry> = ${JSON.stringify(entries, null, '\t')}
`

	const outPath = path.resolve(__dirname, '..', 'src', 'lib', 'holiday-occurrences.generated.ts')
	writeFileSync(outPath, body, 'utf8')

	console.log(`Wrote ${entries.length} entries x ${endYear - startYear + 1} years -> ${outPath}`)
}

main()
