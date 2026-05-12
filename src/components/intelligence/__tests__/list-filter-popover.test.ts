import { describe, expect, it } from 'vitest'

import type { ListRef, Recommendation } from '@/components/intelligence/__fixtures__/types'

import { buildFilterSections, GLOBAL_FILTER_ID, isRecVisible, listIdsForRec } from '../list-filter-popover'

function makeListRef(id: string, name: string): ListRef {
	return { id, name, type: 'wishlist', isPrivate: false, subject: { kind: 'user', name: 'You' } }
}

function makeRec(opts: { listChips?: Array<ListRef>; relatedLists?: Array<ListRef> }): Recommendation {
	return {
		id: `rec-${Math.random()}`,
		analyzerId: 'stale-items',
		kind: 'old-item',
		severity: 'info',
		status: 'active',
		title: 'x',
		body: 'y',
		createdAt: new Date(),
		affected: opts.listChips ? { noun: 'item', count: 1, lines: [], listChips: opts.listChips } : undefined,
		relatedLists: opts.relatedLists,
	}
}

describe('listIdsForRec', () => {
	it('unions listChips and relatedLists into a single id set', () => {
		const a = makeListRef('a', 'A')
		const b = makeListRef('b', 'B')
		const rec = makeRec({ listChips: [a], relatedLists: [b] })
		expect([...listIdsForRec(rec)].sort()).toEqual(['a', 'b'])
	})

	it('returns an empty set for recs with no list scope', () => {
		const rec = makeRec({})
		expect(listIdsForRec(rec).size).toBe(0)
	})

	it('deduplicates ids that appear in both chips and relatedLists', () => {
		const a = makeListRef('a', 'A')
		const rec = makeRec({ listChips: [a], relatedLists: [a] })
		expect(listIdsForRec(rec).size).toBe(1)
	})
})

describe('buildFilterSections', () => {
	it('returns the Global pseudo-row when at least one rec has zero list scope', () => {
		const sections = buildFilterSections([makeRec({})], [])
		expect(sections).toHaveLength(1)
		expect(sections[0].key).toBe('global')
		expect(sections[0].options[0].listId).toBe(GLOBAL_FILTER_ID)
	})

	it('omits the Global pseudo-row when every rec is list-scoped', () => {
		const a = makeListRef('a', 'A')
		const sections = buildFilterSections([makeRec({ listChips: [a] })], [])
		expect(sections.some(s => s.key === 'global')).toBe(false)
	})

	it("groups user-scope lists under 'Your lists' sorted alphabetically", () => {
		const banana = makeListRef('b', 'Banana')
		const apple = makeListRef('a', 'Apple')
		const sections = buildFilterSections([makeRec({ listChips: [banana] }), makeRec({ listChips: [apple] })], [])
		const userSection = sections.find(s => s.key === 'user')!
		expect(userSection.options.map(o => o.listId)).toEqual(['a', 'b'])
	})

	it('groups dependent lists under their own labeled sections', () => {
		const bobby = makeListRef('bobby-1', "Bobby's Birthday")
		const dep = { id: 'dep-bobby', name: 'Bobby', image: null }
		const sections = buildFilterSections([], [{ dependent: dep, recs: [makeRec({ listChips: [bobby] })] }])
		const bobbySection = sections.find(s => s.key === 'dependent:dep-bobby')!
		expect(bobbySection.label).toBe("Bobby's lists")
		expect(bobbySection.options[0].listId).toBe('bobby-1')
	})

	it('puts a list claimed by a dependent into the dependent section, not the user section', () => {
		// Imagine the same list id appears in both the user-scope set and
		// a dependent group - the dependent section wins so we don't
		// double-render the option.
		const shared = makeListRef('shared', 'Shared')
		const sections = buildFilterSections(
			[makeRec({ listChips: [shared] })],
			[{ dependent: { id: 'dep-1', name: 'Alice', image: null }, recs: [makeRec({ listChips: [shared] })] }]
		)
		expect(sections.find(s => s.key === 'user')).toBeUndefined()
		const depSection = sections.find(s => s.key === 'dependent:dep-1')!
		expect(depSection.options.map(o => o.listId)).toEqual(['shared'])
	})
})

describe('isRecVisible', () => {
	const a = makeListRef('a', 'A')
	const b = makeListRef('b', 'B')

	it('shows a rec when any of its list ids is selected', () => {
		const rec = makeRec({ listChips: [a, b] })
		expect(isRecVisible(rec, new Set(['b']))).toBe(true)
	})

	it('hides a rec when none of its list ids is selected', () => {
		const rec = makeRec({ listChips: [a, b] })
		expect(isRecVisible(rec, new Set(['c']))).toBe(false)
	})

	it('shows a global rec when Global is selected', () => {
		const rec = makeRec({})
		expect(isRecVisible(rec, new Set([GLOBAL_FILTER_ID]))).toBe(true)
	})

	it('hides a global rec when Global is not selected', () => {
		const rec = makeRec({})
		expect(isRecVisible(rec, new Set(['a']))).toBe(false)
	})
})
