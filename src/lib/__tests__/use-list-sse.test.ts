import { describe, expect, it, vi } from 'vitest'

import { dispatchListEvent } from '../use-list-sse'

function makeDeps(mode: 'gifter' | 'edit' | 'organize', listId = 42) {
	return {
		queryClient: { invalidateQueries: vi.fn() },
		router: { invalidate: vi.fn() },
		listId,
		mode,
	}
}

describe('dispatchListEvent', () => {
	describe('mode: edit (spoiler protection)', () => {
		it('does NOT invalidate items on a claim event', () => {
			const deps = makeDeps('edit')
			dispatchListEvent({ kind: 'claim', listId: 42 }, deps)
			expect(deps.queryClient.invalidateQueries).not.toHaveBeenCalled()
			expect(deps.router.invalidate).not.toHaveBeenCalled()
		})

		it('invalidates items on item events', () => {
			const deps = makeDeps('edit')
			dispatchListEvent({ kind: 'item', listId: 42, itemId: 7 }, deps)
			expect(deps.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['items', 42] })
		})

		it('invalidates the comment thread on comment events', () => {
			const deps = makeDeps('edit')
			dispatchListEvent({ kind: 'comment', listId: 42, itemId: 7, shape: 'added' }, deps)
			expect(deps.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['item-comments', 7] })
		})

		it('invalidates the route loader on addon and list events', () => {
			const deps = makeDeps('edit')
			dispatchListEvent({ kind: 'addon', listId: 42, addonId: 3, shape: 'added' }, deps)
			dispatchListEvent({ kind: 'list', listId: 42 }, deps)
			expect(deps.router.invalidate).toHaveBeenCalledTimes(2)
		})
	})

	describe('mode: gifter', () => {
		it('invalidates items on claim events', () => {
			const deps = makeDeps('gifter')
			dispatchListEvent({ kind: 'claim', listId: 42 }, deps)
			expect(deps.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['items', 42] })
		})
	})

	describe('mode: organize', () => {
		it('ignores claim, comment, and addon events', () => {
			const deps = makeDeps('organize')
			dispatchListEvent({ kind: 'claim', listId: 42 }, deps)
			dispatchListEvent({ kind: 'comment', listId: 42, itemId: 7 }, deps)
			dispatchListEvent({ kind: 'addon', listId: 42, addonId: 3 }, deps)
			expect(deps.queryClient.invalidateQueries).not.toHaveBeenCalled()
			expect(deps.router.invalidate).not.toHaveBeenCalled()
		})

		it('invalidates items on item events', () => {
			const deps = makeDeps('organize')
			dispatchListEvent({ kind: 'item', listId: 42, itemId: 7, shape: 'added' }, deps)
			expect(deps.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['items', 42] })
		})

		it('invalidates the route loader on list events', () => {
			const deps = makeDeps('organize')
			dispatchListEvent({ kind: 'list', listId: 42 }, deps)
			expect(deps.router.invalidate).toHaveBeenCalled()
		})
	})
})
