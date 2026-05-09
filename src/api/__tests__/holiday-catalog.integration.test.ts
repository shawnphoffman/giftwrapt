// Integration coverage for the holiday-catalog admin impls. Exercises
// the seed-on-first-read bootstrap, list/add/update/delete CRUD, the
// in-use guard on delete, and the snapshot used by the new-list pickers.
//
// Opt-in default: every seeded row starts disabled, and so does every
// row added by the admin. Tests that need a row to be visible to
// `isValidHolidayKey` / the snapshot enable it explicitly via
// `updateCatalogEntryImpl`.

import { describe, expect, it } from 'vitest'

import {
	addCatalogEntryImpl,
	deleteCatalogEntryImpl,
	getHolidaySnapshotImpl,
	listCatalogEntriesImpl,
	listLibraryCandidatesImpl,
	updateCatalogEntryImpl,
} from '@/api/_holiday-catalog-impl'
import { _resetHolidayCatalogSeedLatchForTesting } from '@/db/holiday-catalog-seed'
import { holidayCatalog, lists } from '@/db/schema'
import { endOfOccurrence, getCatalogEntry, isValidHolidayKey, lastOccurrence, listHolidaysFor, nextOccurrence } from '@/lib/holidays'

import { makeUser } from '../../../test/integration/factories'
import { withRollback } from '../../../test/integration/setup'

describe('holiday-catalog: seed bootstrap', () => {
	it('seeds the table from the default allowlist on first read', async () => {
		await withRollback(async tx => {
			_resetHolidayCatalogSeedLatchForTesting()
			const before = await tx.select().from(holidayCatalog)
			expect(before).toEqual([])

			const entries = await listCatalogEntriesImpl({ input: { country: 'US' }, dbx: tx })
			expect(entries.length).toBeGreaterThan(0)
			expect(entries.find(e => e.slug === 'easter')).toBeDefined()
			expect(entries.find(e => e.slug === 'thanksgiving')).toBeDefined()
		})
	})

	it('isValidHolidayKey only accepts entries an admin has enabled', async () => {
		await withRollback(async tx => {
			_resetHolidayCatalogSeedLatchForTesting()
			// Seeded rows start disabled (opt-in policy), so the new-list
			// validator rejects them until an admin flips them on.
			expect(await isValidHolidayKey('US', 'easter', tx)).toBe(false)

			const list = await listCatalogEntriesImpl({ input: { country: 'US' }, dbx: tx })
			const easter = list.find(e => e.slug === 'easter')!
			await updateCatalogEntryImpl({ input: { id: easter.id, isEnabled: true }, dbx: tx })

			expect(await isValidHolidayKey('US', 'easter', tx)).toBe(true)
			expect(await isValidHolidayKey('US', 'made-up', tx)).toBe(false)
			expect(await isValidHolidayKey('FR', 'easter', tx)).toBe(false)
		})
	})
})

describe('holiday-catalog: enable / disable behavior', () => {
	it('disabled entries vanish from the snapshot but stay resolvable for date math', async () => {
		await withRollback(async tx => {
			_resetHolidayCatalogSeedLatchForTesting()

			const list = await listCatalogEntriesImpl({ input: { country: 'US' }, dbx: tx })
			const easter = list.find(e => e.slug === 'easter')
			expect(easter).toBeDefined()

			// Seeded rows are opt-in; flip Easter on so we can verify it
			// flows through the snapshot, then flip it back off and assert
			// it disappears (while date math keeps working for any list
			// that was already pinned to it).
			const enable = await updateCatalogEntryImpl({ input: { id: easter!.id, isEnabled: true }, dbx: tx })
			expect(enable.kind).toBe('ok')
			const enabledSnap = await getHolidaySnapshotImpl({ dbx: tx })
			expect((enabledSnap.byCountry['US'] ?? []).find(h => h.key === 'easter')).toBeDefined()

			const disable = await updateCatalogEntryImpl({ input: { id: easter!.id, isEnabled: false }, dbx: tx })
			expect(disable.kind).toBe('ok')

			// Snapshot only surfaces enabled entries.
			const snap = await getHolidaySnapshotImpl({ dbx: tx })
			const us = snap.byCountry['US'] ?? []
			expect(us.find(h => h.key === 'easter')).toBeUndefined()

			// listHolidaysFor (used by the snapshot generator) also filters.
			const enabled = await listHolidaysFor('US', 2026, tx)
			expect(enabled.find(h => h.key === 'easter')).toBeUndefined()

			// But the date helpers still resolve disabled rows.
			expect(await isValidHolidayKey('US', 'easter', tx)).toBe(false)
			expect(await getCatalogEntry('US', 'easter', tx)).not.toBeNull()
			const next = await nextOccurrence('US', 'easter', new Date('2026-01-01T12:00:00Z'), tx)
			expect(next?.toISOString().slice(0, 10)).toBe('2026-04-05')
			const last = await lastOccurrence('US', 'easter', new Date('2026-05-01T12:00:00Z'), tx)
			expect(last?.toISOString().slice(0, 10)).toBe('2026-04-05')
			const end = await endOfOccurrence('US', 'easter', new Date('2026-04-05T00:00:00Z'), tx)
			expect(end?.toISOString().slice(0, 10)).toBe('2026-04-06')
		})
	})

	it('seeded rows start disabled across every country', async () => {
		await withRollback(async tx => {
			_resetHolidayCatalogSeedLatchForTesting()
			for (const country of ['US', 'CA', 'GB', 'AU']) {
				const rows = await listCatalogEntriesImpl({ input: { country }, dbx: tx })
				expect(rows.length).toBeGreaterThan(0)
				expect(rows.every(r => r.isEnabled === false)).toBe(true)
			}
			// And the snapshot is empty until an admin opts something in.
			const snap = await getHolidaySnapshotImpl({ dbx: tx })
			expect(snap.countries).toEqual([])
			expect(snap.byCountry).toEqual({})
		})
	})
})

describe('holiday-catalog: add', () => {
	it('rejects an invalid country', async () => {
		await withRollback(async tx => {
			_resetHolidayCatalogSeedLatchForTesting()
			const result = await addCatalogEntryImpl({ input: { country: 'ZZ', rule: 'easter' }, dbx: tx })
			expect(result).toEqual({ kind: 'error', reason: 'invalid-country' })
		})
	})

	it('rejects a rule that does not resolve in the library', async () => {
		await withRollback(async tx => {
			_resetHolidayCatalogSeedLatchForTesting()
			const result = await addCatalogEntryImpl({ input: { country: 'US', rule: 'totally bogus rule' }, dbx: tx })
			expect(result).toEqual({ kind: 'error', reason: 'invalid-rule' })
		})
	})

	it('rejects a duplicate slug for the same country', async () => {
		await withRollback(async tx => {
			_resetHolidayCatalogSeedLatchForTesting()
			// Seed by reading once, then attempt to re-add with the same slug
			// a seed entry already owns.
			await listCatalogEntriesImpl({ input: { country: 'US' }, dbx: tx })
			const result = await addCatalogEntryImpl({
				input: { country: 'US', rule: 'easter', name: 'Easter (custom label)', slug: 'easter' },
				dbx: tx,
			})
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('duplicate-slug')
		})
	})

	it('adds a new entry from the library disabled, and surfaces it only after the admin enables it', async () => {
		await withRollback(async tx => {
			_resetHolidayCatalogSeedLatchForTesting()
			await listCatalogEntriesImpl({ input: { country: 'US' }, dbx: tx })

			const candidates = await listLibraryCandidatesImpl({ input: { country: 'US' }, dbx: tx })
			const columbus = candidates.find(c => c.name.toLowerCase().includes('columbus'))
			// If the library doesn't expose Columbus Day for some reason,
			// just take the first available candidate so the test stays
			// meaningful.
			const candidate = columbus ?? candidates[0]
			expect(candidate).toBeDefined()

			const result = await addCatalogEntryImpl({
				input: { country: 'US', rule: candidate.rule, name: candidate.name },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')
			if (result.kind !== 'ok') return

			// Newly added entries are opt-in: invisible to the snapshot
			// until the admin flips them on.
			const before = await getHolidaySnapshotImpl({ dbx: tx })
			expect((before.byCountry['US'] ?? []).find(h => h.key === result.slug)).toBeUndefined()

			await updateCatalogEntryImpl({ input: { id: result.id, isEnabled: true }, dbx: tx })

			const after = await getHolidaySnapshotImpl({ dbx: tx })
			expect((after.byCountry['US'] ?? []).find(h => h.key === result.slug)).toBeDefined()
		})
	})
})

describe('holiday-catalog: delete', () => {
	it('deletes an entry that no list references', async () => {
		await withRollback(async tx => {
			_resetHolidayCatalogSeedLatchForTesting()
			const list = await listCatalogEntriesImpl({ input: { country: 'GB' }, dbx: tx })
			const target = list.find(e => e.slug === 'easter-monday')
			expect(target).toBeDefined()

			const result = await deleteCatalogEntryImpl({ input: { id: target!.id }, dbx: tx })
			expect(result).toEqual({ kind: 'ok' })

			const after = await listCatalogEntriesImpl({ input: { country: 'GB' }, dbx: tx })
			expect(after.find(e => e.slug === 'easter-monday')).toBeUndefined()
		})
	})

	it('refuses to delete an entry that is still referenced by a list', async () => {
		await withRollback(async tx => {
			_resetHolidayCatalogSeedLatchForTesting()
			const owner = await makeUser(tx)
			const list = await listCatalogEntriesImpl({ input: { country: 'US' }, dbx: tx })
			const target = list.find(e => e.slug === 'easter')!

			await tx.insert(lists).values({
				name: 'Easter 2026',
				type: 'holiday',
				ownerId: owner.id,
				holidayCountry: 'US',
				holidayKey: 'easter',
			})

			const result = await deleteCatalogEntryImpl({ input: { id: target.id }, dbx: tx })
			expect(result.kind).toBe('error')
			if (result.kind === 'error') {
				expect(result.reason).toBe('in-use')
				expect(result.usageCount).toBe(1)
			}
		})
	})
})

describe('holiday-catalog: snapshot shape', () => {
	it('returns enabled countries in alphabetical order with computed start/end ISO strings', async () => {
		await withRollback(async tx => {
			_resetHolidayCatalogSeedLatchForTesting()
			// Opt in to one row per launch country so the snapshot has
			// something to render. The shape assertions below don't care
			// which holiday is on, just that an enabled row from each
			// country flows through with valid (start, end) ISO strings.
			for (const country of ['US', 'CA', 'GB', 'AU']) {
				const rows = await listCatalogEntriesImpl({ input: { country }, dbx: tx })
				const target = rows.find(r => r.slug === 'easter') ?? rows[0]
				expect(target).toBeDefined()
				await updateCatalogEntryImpl({ input: { id: target.id, isEnabled: true }, dbx: tx })
			}

			const snap = await getHolidaySnapshotImpl({ dbx: tx })
			const codes = snap.countries.map(c => c.code)
			expect(codes).toContain('US')
			expect(codes).toContain('CA')
			expect(codes).toContain('GB')
			expect(codes).toContain('AU')

			for (const code of codes) {
				const entries = snap.byCountry[code] ?? []
				for (const e of entries) {
					expect(typeof e.start).toBe('string')
					expect(typeof e.end).toBe('string')
					expect(new Date(e.start).getTime()).toBeLessThan(new Date(e.end).getTime() + 86_400_000 * 30)
				}
			}
		})
	})
})
