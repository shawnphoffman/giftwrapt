import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// drizzle-kit's migrate command treats the largest `created_at` in
// __drizzle_migrations as a high-water mark and skips any journal entry
// whose `when` is <= that value. If `when` ever goes non-monotonic with
// `idx`, a later migration can be silently treated as already-applied
// and never run. This check fails the build before that can happen.
//
// Background: 0017_military_dreaming_celestial slipped past production
// because 0016's `when` had been hand-edited to a future value, putting
// 0017's wall-clock `when` below 0016's high-water mark.

type JournalEntry = {
	idx: number
	version: string
	when: number
	tag: string
	breakpoints: boolean
}

type Journal = {
	version: string
	dialect: string
	entries: Array<JournalEntry>
}

const journalPath = resolve(process.cwd(), 'drizzle/meta/_journal.json')
const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as Journal

const errors: Array<string> = []
const sorted = [...journal.entries].sort((a, b) => a.idx - b.idx)

for (let i = 0; i < sorted.length; i++) {
	const entry = sorted[i]
	if (entry.idx !== i) {
		errors.push(`entry at position ${i} has idx ${entry.idx}; expected ${i}`)
	}
	if (i > 0) {
		const prev = sorted[i - 1]
		if (entry.when <= prev.when) {
			errors.push(
				`${entry.tag} (idx ${entry.idx}, when ${entry.when}) is not strictly greater than ${prev.tag} (idx ${prev.idx}, when ${prev.when}). ` +
					`drizzle-kit will skip it on databases that have already applied ${prev.tag}.`
			)
		}
	}
}

if (errors.length > 0) {
	console.error('drizzle/meta/_journal.json invariant violation:')
	for (const e of errors) console.error('  - ' + e)
	console.error(
		'\nFix: regenerate the offending migration (pnpm db:generate) so its `when` is fresh, ' +
			'or hand-edit the journal so all `when` values are strictly increasing by `idx`.'
	)
	process.exit(1)
}

console.log(`drizzle journal OK (${sorted.length} entries, monotonic by idx)`)
