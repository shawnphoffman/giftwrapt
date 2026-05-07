import { describe, expect, it, vi } from 'vitest'

import { dispatchPurchasesReceivedEvent } from '../use-purchases-received-sse'
import { dispatchPurchasesEvent } from '../use-purchases-sse'
import { dispatchRecentCommentsEvent } from '../use-recent-comments-sse'
import { dispatchRecentItemsEvent } from '../use-recent-items-sse'

function qcDeps() {
	return { queryClient: { invalidateQueries: vi.fn() } }
}
function rDeps() {
	return { router: { invalidate: vi.fn() } }
}

describe('dispatchRecentItemsEvent', () => {
	it('refreshes on claim and item events', () => {
		const deps = qcDeps()
		dispatchRecentItemsEvent({ kind: 'claim', listId: 1 }, deps)
		dispatchRecentItemsEvent({ kind: 'item', listId: 1, itemId: 2 }, deps)
		expect(deps.queryClient.invalidateQueries).toHaveBeenCalledTimes(2)
		expect(deps.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['recent', 'items'] })
	})

	it('ignores comment, addon, and list events', () => {
		const deps = qcDeps()
		dispatchRecentItemsEvent({ kind: 'comment', listId: 1, itemId: 2 }, deps)
		dispatchRecentItemsEvent({ kind: 'addon', listId: 1, addonId: 3 }, deps)
		dispatchRecentItemsEvent({ kind: 'list', listId: 1 }, deps)
		expect(deps.queryClient.invalidateQueries).not.toHaveBeenCalled()
	})
})

describe('dispatchRecentCommentsEvent', () => {
	it('refreshes only on comment events', () => {
		const deps = qcDeps()
		dispatchRecentCommentsEvent({ kind: 'comment', listId: 1, itemId: 2 }, deps)
		dispatchRecentCommentsEvent({ kind: 'claim', listId: 1 }, deps)
		dispatchRecentCommentsEvent({ kind: 'item', listId: 1, itemId: 2 }, deps)
		dispatchRecentCommentsEvent({ kind: 'addon', listId: 1, addonId: 3 }, deps)
		dispatchRecentCommentsEvent({ kind: 'list', listId: 1 }, deps)
		expect(deps.queryClient.invalidateQueries).toHaveBeenCalledTimes(1)
		expect(deps.queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['recent', 'conversations'] })
	})
})

describe('dispatchPurchasesEvent', () => {
	it('refreshes only on claim events', () => {
		const deps = rDeps()
		dispatchPurchasesEvent({ kind: 'claim', listId: 1 }, deps)
		dispatchPurchasesEvent({ kind: 'item', listId: 1, itemId: 2 }, deps)
		dispatchPurchasesEvent({ kind: 'comment', listId: 1, itemId: 2 }, deps)
		dispatchPurchasesEvent({ kind: 'addon', listId: 1, addonId: 3 }, deps)
		dispatchPurchasesEvent({ kind: 'list', listId: 1 }, deps)
		expect(deps.router.invalidate).toHaveBeenCalledTimes(1)
	})
})

describe('dispatchPurchasesReceivedEvent', () => {
	it('refreshes on claim, addon, and item events', () => {
		const deps = rDeps()
		dispatchPurchasesReceivedEvent({ kind: 'claim', listId: 1 }, deps)
		dispatchPurchasesReceivedEvent({ kind: 'addon', listId: 1, addonId: 3 }, deps)
		dispatchPurchasesReceivedEvent({ kind: 'item', listId: 1, itemId: 2 }, deps)
		expect(deps.router.invalidate).toHaveBeenCalledTimes(3)
	})

	it('ignores comment and list events', () => {
		const deps = rDeps()
		dispatchPurchasesReceivedEvent({ kind: 'comment', listId: 1, itemId: 2 }, deps)
		dispatchPurchasesReceivedEvent({ kind: 'list', listId: 1 }, deps)
		expect(deps.router.invalidate).not.toHaveBeenCalled()
	})
})
