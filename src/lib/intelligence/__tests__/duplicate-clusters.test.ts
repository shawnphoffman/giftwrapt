// Pure-helper tests for the duplicates clustering pass added to
// list-hygiene in 2026-05 (phase 2). Exercises the cluster trigger
// predicate, survivor selection, type/customHolidayId bucketing, and
// the empty-list / pending-deletion exclusions.
//
// Integration tests for the analyzer wire-up + the merge-lists apply
// branch live under src/api/__tests__ — this file is in-memory only.

import { describe, expect, it } from 'vitest'

import { type DuplicateListRow, findDuplicateClusters } from '../analyzers/list-hygiene'

const NOW = new Date('2026-05-14T12:00:00Z')

function row(overrides: Partial<DuplicateListRow> & { id: number }): DuplicateListRow {
	const createdAt = overrides.createdAt ?? new Date('2024-01-01T00:00:00Z')
	return {
		id: overrides.id,
		name: overrides.name ?? `List ${overrides.id}`,
		type: overrides.type ?? 'wishlist',
		isPrimary: overrides.isPrimary ?? false,
		isPrivate: overrides.isPrivate ?? false,
		customHolidayId: overrides.customHolidayId ?? null,
		createdAt,
		updatedAt: overrides.updatedAt ?? createdAt,
	}
}

function counts(entries: Array<[number, number]>): Map<number, number> {
	return new Map(entries)
}

describe('findDuplicateClusters', () => {
	it('returns no clusters when only one list per (type, customHolidayId) bucket', () => {
		const lists = [
			row({ id: 1, type: 'wishlist', createdAt: new Date('2023-01-01') }),
			row({ id: 2, type: 'christmas', createdAt: new Date('2023-01-01') }),
		]
		const clusters = findDuplicateClusters({
			subjectLists: lists,
			itemCountByList: counts([
				[1, 3],
				[2, 5],
			]),
			now: NOW,
		})
		expect(clusters).toEqual([])
	})

	it('clusters two same-type lists when the older one is forgotten and both have items', () => {
		const older = row({
			id: 1,
			type: 'wishlist',
			name: 'Old wishlist',
			createdAt: new Date('2022-01-01'),
			updatedAt: new Date('2024-01-01'),
		})
		const newer = row({
			id: 2,
			type: 'wishlist',
			name: 'New wishlist',
			createdAt: new Date('2026-04-01'),
			updatedAt: new Date('2026-04-01'),
		})
		const clusters = findDuplicateClusters({
			subjectLists: [older, newer],
			itemCountByList: counts([
				[1, 2],
				[2, 4],
			]),
			now: NOW,
		})
		expect(clusters).toHaveLength(1)
		expect(clusters[0].survivor.id).toBe(2)
		expect(clusters[0].sources.map(s => s.id)).toEqual([1])
		expect(clusters[0].type).toBe('wishlist')
	})

	it('yields when the older list was touched within the 365-day window', () => {
		// Both have items; older was updated recently — likely still in use.
		const older = row({
			id: 1,
			type: 'wishlist',
			createdAt: new Date('2022-01-01'),
			updatedAt: new Date('2026-04-01'),
		})
		const newer = row({
			id: 2,
			type: 'wishlist',
			createdAt: new Date('2026-04-30'),
			updatedAt: new Date('2026-04-30'),
		})
		const clusters = findDuplicateClusters({
			subjectLists: [older, newer],
			itemCountByList: counts([
				[1, 1],
				[2, 1],
			]),
			now: NOW,
		})
		expect(clusters).toEqual([])
	})

	it('excludes lists with zero non-archived items', () => {
		// Older bucket has zero items, so the cluster falls below 2.
		const older = row({ id: 1, type: 'wishlist', createdAt: new Date('2022-01-01'), updatedAt: new Date('2024-01-01') })
		const newer = row({ id: 2, type: 'wishlist', createdAt: new Date('2026-04-01'), updatedAt: new Date('2026-04-01') })
		const clusters = findDuplicateClusters({
			subjectLists: [older, newer],
			itemCountByList: counts([[2, 3]]), // list 1 absent → 0 items
			now: NOW,
		})
		expect(clusters).toEqual([])
	})

	it('excludes giftideas and todos types entirely', () => {
		const a = row({ id: 1, type: 'giftideas', createdAt: new Date('2022-01-01'), updatedAt: new Date('2024-01-01') })
		const b = row({ id: 2, type: 'giftideas', createdAt: new Date('2026-04-01'), updatedAt: new Date('2026-04-01') })
		const c = row({ id: 3, type: 'todos', createdAt: new Date('2022-01-01'), updatedAt: new Date('2024-01-01') })
		const d = row({ id: 4, type: 'todos', createdAt: new Date('2026-04-01'), updatedAt: new Date('2026-04-01') })
		const clusters = findDuplicateClusters({
			subjectLists: [a, b, c, d],
			itemCountByList: counts([
				[1, 2],
				[2, 2],
				[3, 2],
				[4, 2],
			]),
			now: NOW,
		})
		expect(clusters).toEqual([])
	})

	it('clusters matching-customHolidayId holiday lists; non-matching are separate buckets', () => {
		const easterId = '00000000-0000-0000-0000-000000000001'
		const halloweenId = '00000000-0000-0000-0000-000000000002'
		const lists = [
			row({
				id: 1,
				type: 'holiday',
				customHolidayId: easterId,
				createdAt: new Date('2022-01-01'),
				updatedAt: new Date('2024-01-01'),
			}),
			row({
				id: 2,
				type: 'holiday',
				customHolidayId: easterId,
				createdAt: new Date('2026-04-01'),
				updatedAt: new Date('2026-04-01'),
			}),
			row({
				id: 3,
				type: 'holiday',
				customHolidayId: halloweenId,
				createdAt: new Date('2022-01-01'),
				updatedAt: new Date('2024-01-01'),
			}),
		]
		const clusters = findDuplicateClusters({
			subjectLists: lists,
			itemCountByList: counts([
				[1, 1],
				[2, 1],
				[3, 1],
			]),
			now: NOW,
		})
		expect(clusters).toHaveLength(1)
		expect(clusters[0].customHolidayId).toBe(easterId)
		expect(clusters[0].survivor.id).toBe(2)
	})

	it('skips holiday lists with null customHolidayId (apply branch requires a match)', () => {
		const lists = [
			row({ id: 1, type: 'holiday', customHolidayId: null, createdAt: new Date('2022-01-01'), updatedAt: new Date('2024-01-01') }),
			row({ id: 2, type: 'holiday', customHolidayId: null, createdAt: new Date('2026-04-01'), updatedAt: new Date('2026-04-01') }),
		]
		const clusters = findDuplicateClusters({
			subjectLists: lists,
			itemCountByList: counts([
				[1, 1],
				[2, 1],
			]),
			now: NOW,
		})
		expect(clusters).toEqual([])
	})

	it('selects newest createdAt as survivor across three lists, isPrimary breaking createdAt ties', () => {
		const a = row({ id: 1, name: 'A', createdAt: new Date('2022-01-01'), updatedAt: new Date('2024-01-01') })
		const b = row({ id: 2, name: 'B', createdAt: new Date('2026-04-01'), updatedAt: new Date('2026-04-01') })
		const c = row({ id: 3, name: 'C', isPrimary: true, createdAt: new Date('2026-04-01'), updatedAt: new Date('2026-04-01') })
		const clusters = findDuplicateClusters({
			subjectLists: [a, b, c],
			itemCountByList: counts([
				[1, 1],
				[2, 1],
				[3, 1],
			]),
			now: NOW,
		})
		expect(clusters).toHaveLength(1)
		// Tie on createdAt between B and C — isPrimary on C wins.
		expect(clusters[0].survivor.id).toBe(3)
		expect(clusters[0].sources.map(s => s.id).sort()).toEqual([1, 2])
	})

	it('falls back to highest updatedAt then lowest id on full ties', () => {
		const sameCreated = new Date('2026-04-01')
		const a = row({ id: 1, createdAt: sameCreated, updatedAt: new Date('2026-04-15') })
		const b = row({ id: 2, createdAt: sameCreated, updatedAt: new Date('2026-04-20') })
		// Force a forgotten-ish older list to satisfy the cluster predicate.
		const older = row({ id: 3, createdAt: new Date('2022-01-01'), updatedAt: new Date('2024-01-01') })
		const clusters = findDuplicateClusters({
			subjectLists: [a, b, older],
			itemCountByList: counts([
				[1, 1],
				[2, 1],
				[3, 1],
			]),
			now: NOW,
		})
		expect(clusters).toHaveLength(1)
		// b wins updatedAt tiebreak over a; older trails.
		expect(clusters[0].survivor.id).toBe(2)
	})

	it('returns clusters in stable order across types and customHolidayId', () => {
		const easterId = '00000000-0000-0000-0000-000000000010'
		const halloweenId = '00000000-0000-0000-0000-000000000020'
		const make = (id: number, type: DuplicateListRow['type'], customHolidayId: string | null = null) =>
			row({
				id,
				type,
				customHolidayId,
				createdAt: id % 2 === 0 ? new Date('2022-01-01') : new Date('2026-04-01'),
				updatedAt: id % 2 === 0 ? new Date('2024-01-01') : new Date('2026-04-01'),
			})
		const lists: Array<DuplicateListRow> = [
			make(1, 'wishlist'),
			make(2, 'wishlist'),
			make(3, 'christmas'),
			make(4, 'christmas'),
			make(5, 'holiday', easterId),
			make(6, 'holiday', easterId),
			make(7, 'holiday', halloweenId),
			make(8, 'holiday', halloweenId),
		]
		const itemCountByList = counts(lists.map(l => [l.id, 1] as [number, number]))
		const clusters = findDuplicateClusters({ subjectLists: lists, itemCountByList, now: NOW })
		expect(clusters.map(c => c.type)).toEqual(['christmas', 'holiday', 'holiday', 'wishlist'])
		expect(clusters.map(c => c.customHolidayId)).toEqual([null, easterId, halloweenId, null])
	})
})
