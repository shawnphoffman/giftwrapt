import { describe, expect, it, vi } from 'vitest'

import { applyListEventLocally } from '../list-events'

function makeDeps() {
	return {
		queryClient: { invalidateQueries: vi.fn() },
		router: { invalidate: vi.fn() },
	}
}

function invalidatedKeys(deps: ReturnType<typeof makeDeps>): Array<unknown> {
	return deps.queryClient.invalidateQueries.mock.calls.map(([arg]) => (arg as { queryKey: unknown }).queryKey)
}

describe('applyListEventLocally', () => {
	// The whole point of this helper: a user's OWN mutation refreshes their OWN
	// surfaces without waiting on the in-memory SSE broadcast, which doesn't
	// cross serverless invocations on Vercel.
	describe('claim', () => {
		it('fans out to every surface that renders claim-affected counts', () => {
			const deps = makeDeps()
			applyListEventLocally({ kind: 'claim', listId: 42 }, deps)
			const keys = invalidatedKeys(deps)
			expect(keys).toContainEqual(['items', 42])
			expect(keys).toContainEqual(['lists', 'public', 'grouped'])
			expect(keys).toContainEqual(['my-lists'])
			expect(keys).toContainEqual(['recent', 'items'])
			// /purchases + /purchases/received are loader-driven.
			expect(deps.router.invalidate).toHaveBeenCalled()
		})
	})

	describe('item', () => {
		it('invalidates items + recent without shape, and adds count surfaces with shape', () => {
			const noShape = makeDeps()
			applyListEventLocally({ kind: 'item', listId: 42, itemId: 7 }, noShape)
			expect(invalidatedKeys(noShape)).toContainEqual(['items', 42])
			expect(invalidatedKeys(noShape)).toContainEqual(['recent', 'items'])
			expect(invalidatedKeys(noShape)).not.toContainEqual(['my-lists'])

			const withShape = makeDeps()
			applyListEventLocally({ kind: 'item', listId: 42, itemId: 7, shape: 'added' }, withShape)
			expect(invalidatedKeys(withShape)).toContainEqual(['my-lists'])
			expect(invalidatedKeys(withShape)).toContainEqual(['lists', 'public', 'grouped'])
		})
	})

	describe('comment', () => {
		it('invalidates the thread and the conversations feed only', () => {
			const deps = makeDeps()
			applyListEventLocally({ kind: 'comment', listId: 42, itemId: 7 }, deps)
			expect(invalidatedKeys(deps)).toEqual([
				['item-comments', 7],
				['recent', 'conversations'],
			])
			expect(deps.router.invalidate).not.toHaveBeenCalled()
		})
	})

	describe('addon', () => {
		it('invalidates the addons query (gifter view) and the loader', () => {
			const deps = makeDeps()
			applyListEventLocally({ kind: 'addon', listId: 42, addonId: 3 }, deps)
			expect(invalidatedKeys(deps)).toContainEqual(['list-detail', 42, 'addons'])
			expect(deps.router.invalidate).toHaveBeenCalled()
		})
	})

	describe('list', () => {
		it('invalidates list-detail, the public feed, and my-lists', () => {
			const deps = makeDeps()
			applyListEventLocally({ kind: 'list', listId: 42 }, deps)
			const keys = invalidatedKeys(deps)
			expect(keys).toContainEqual(['list-detail', 42])
			expect(keys).toContainEqual(['lists', 'public', 'grouped'])
			expect(keys).toContainEqual(['my-lists'])
			expect(deps.router.invalidate).toHaveBeenCalled()
		})
	})

	it('works without a router (queryClient-only callers)', () => {
		const queryClient = { invalidateQueries: vi.fn() }
		expect(() => applyListEventLocally({ kind: 'claim', listId: 1 }, { queryClient })).not.toThrow()
		expect(queryClient.invalidateQueries).toHaveBeenCalled()
	})
})
