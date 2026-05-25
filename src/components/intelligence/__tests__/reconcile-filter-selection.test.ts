import { describe, expect, it } from 'vitest'

import { reconcileFilterSelection } from '../intelligence-page'

const set = (...ids: Array<string>) => new Set(ids)

describe('reconcileFilterSelection', () => {
	it('preserves an unchecked id across a refetch that does not change the option set', () => {
		// User has unchecked B. A refetch (triggered by an action) emits a
		// fresh allFilterIds Set with the same contents. The unchecked id
		// must stay out of the selection.
		const all = set('a', 'b')
		const next = reconcileFilterSelection(set('a'), all, all, all)
		expect([...next].sort()).toEqual(['a'])
	})

	it('adds a truly new public id to the selection by default', () => {
		const all = set('a', 'b', 'c')
		const next = reconcileFilterSelection(set('a', 'b'), all, set('a', 'b'), all)
		expect([...next].sort()).toEqual(['a', 'b', 'c'])
	})

	it('does NOT auto-add a truly new id when it is not in the default-selected set (e.g. private list)', () => {
		const all = set('a', 'b', 'c')
		const defaults = set('a', 'b') // c is private, default-unchecked
		const next = reconcileFilterSelection(set('a', 'b'), all, set('a', 'b'), defaults)
		expect([...next].sort()).toEqual(['a', 'b'])
	})

	it('does not add a new id when the user has explicitly cleared everything', () => {
		const all = set('a', 'b', 'c')
		const next = reconcileFilterSelection(set(), all, set('a', 'b'), all)
		expect(next.size).toBe(0)
	})

	it('drops ids that no longer appear in the option set', () => {
		const all = set('a')
		const next = reconcileFilterSelection(set('a', 'b'), all, set('a', 'b'), all)
		expect([...next]).toEqual(['a'])
	})

	it('returns the same Set reference when nothing logically changed', () => {
		const prev = set('a', 'b')
		const all = set('a', 'b')
		const next = reconcileFilterSelection(prev, all, all, all)
		expect(next).toBe(prev)
	})

	it('handles the combined case: drop a stale id and preserve an unchecked one', () => {
		// User had {a, b, c} as options, unchecked b. After refetch c is
		// gone but b is still an option. Selection should stay {a} only.
		const all = set('a', 'b')
		const next = reconcileFilterSelection(set('a'), all, set('a', 'b', 'c'), all)
		expect([...next]).toEqual(['a'])
	})

	it('initial-mount no-op when prev === allFilterIds', () => {
		const all = set('a', 'b')
		const next = reconcileFilterSelection(all, all, all, all)
		expect(next).toBe(all)
	})
})
