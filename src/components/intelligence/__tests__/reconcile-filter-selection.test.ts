import { describe, expect, it } from 'vitest'

import { reconcileFilterSelection } from '../intelligence-page'

const set = (...ids: Array<string>) => new Set(ids)

describe('reconcileFilterSelection', () => {
	it('preserves an unchecked id across a refetch that does not change the option set', () => {
		// User has unchecked B. A refetch (triggered by an action) emits a
		// fresh allFilterIds Set with the same contents. The unchecked id
		// must stay out of the selection.
		const next = reconcileFilterSelection(set('a'), set('a', 'b'), set('a', 'b'))
		expect([...next].sort()).toEqual(['a'])
	})

	it('adds a truly new id to the selection by default', () => {
		const next = reconcileFilterSelection(set('a', 'b'), set('a', 'b', 'c'), set('a', 'b'))
		expect([...next].sort()).toEqual(['a', 'b', 'c'])
	})

	it('does not add a new id when the user has explicitly cleared everything', () => {
		const next = reconcileFilterSelection(set(), set('a', 'b', 'c'), set('a', 'b'))
		expect(next.size).toBe(0)
	})

	it('drops ids that no longer appear in the option set', () => {
		const next = reconcileFilterSelection(set('a', 'b'), set('a'), set('a', 'b'))
		expect([...next]).toEqual(['a'])
	})

	it('returns the same Set reference when nothing logically changed', () => {
		const prev = set('a', 'b')
		const next = reconcileFilterSelection(prev, set('a', 'b'), set('a', 'b'))
		expect(next).toBe(prev)
	})

	it('handles the combined case: drop a stale id and preserve an unchecked one', () => {
		// User had {a, b, c} as options, unchecked b. After refetch c is
		// gone but b is still an option. Selection should stay {a} only.
		const next = reconcileFilterSelection(set('a'), set('a', 'b'), set('a', 'b', 'c'))
		expect([...next]).toEqual(['a'])
	})

	it('initial-mount no-op when prev === allFilterIds', () => {
		const all = set('a', 'b')
		const next = reconcileFilterSelection(all, all, all)
		expect(next).toBe(all)
	})
})
