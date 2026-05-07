import { describe, expect, it, vi } from 'vitest'

import { dispatchMeEvent } from '../use-me-sse'

function makeDeps() {
	return {
		queryClient: { invalidateQueries: vi.fn() },
		router: { invalidate: vi.fn() },
	}
}

describe('dispatchMeEvent', () => {
	it('invalidates my-lists on claim events', () => {
		const deps = makeDeps()
		dispatchMeEvent({ kind: 'claim', listId: 1 }, deps)
		expect(deps.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['my-lists'] })
	})

	it('invalidates my-lists on item events with shape', () => {
		const deps = makeDeps()
		dispatchMeEvent({ kind: 'item', listId: 1, itemId: 5, shape: 'added' }, deps)
		expect(deps.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['my-lists'] })
	})

	it('ignores item events without shape', () => {
		const deps = makeDeps()
		dispatchMeEvent({ kind: 'item', listId: 1, itemId: 5 }, deps)
		expect(deps.queryClient.invalidateQueries).not.toHaveBeenCalled()
	})

	it('invalidates my-lists AND the route loader on list events', () => {
		const deps = makeDeps()
		dispatchMeEvent({ kind: 'list', listId: 1, shape: 'archived' }, deps)
		expect(deps.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['my-lists'] })
		expect(deps.router.invalidate).toHaveBeenCalled()
	})

	it('ignores comment and addon events', () => {
		const deps = makeDeps()
		dispatchMeEvent({ kind: 'comment', listId: 1, itemId: 5 }, deps)
		dispatchMeEvent({ kind: 'addon', listId: 1, addonId: 3 }, deps)
		expect(deps.queryClient.invalidateQueries).not.toHaveBeenCalled()
		expect(deps.router.invalidate).not.toHaveBeenCalled()
	})
})
