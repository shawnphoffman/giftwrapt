import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

import { itemsKeys } from '@/lib/queries/items'
import type { ListEvent } from '@/routes/api/sse/list.$listId'

/**
 * Per-list SSE subscriber, parameterized by which surface is mounting it.
 *
 * - `gifter` (default): the public/gifter view of `/lists/$listId`. Sees all
 *   five kinds.
 * - `edit`: the owner's edit view at `/lists_/$listId/edit`. Spoiler
 *   protection: claim events are intentionally ignored - the owner cannot
 *   see claims (per .notes/logic.md), so refetching would either flicker
 *   counts the owner shouldn't react to or leak claim presence via timing.
 * - `organize`: the owner's reorder/grouping view. Cares about item shape
 *   and list metadata only; comments and addons are not rendered there.
 */
export type ListSSEMode = 'gifter' | 'edit' | 'organize'

type DispatchDeps = {
	queryClient: Pick<QueryClient, 'invalidateQueries'>
	router: { invalidate: () => void | Promise<unknown> }
	listId: number
	mode: ListSSEMode
}

/**
 * Pure dispatcher: maps a `ListEvent` to invalidations under the given mode.
 * Exported for unit tests (spoiler-protection regression in particular).
 */
export function dispatchListEvent(event: ListEvent, deps: DispatchDeps): void {
	const { queryClient, router, listId, mode } = deps
	switch (event.kind) {
		case 'claim':
			// Spoiler protection: owner-side surfaces never refetch on claims.
			if (mode === 'edit' || mode === 'organize') return
			queryClient.invalidateQueries({ queryKey: itemsKeys.byList(listId) })
			return
		case 'item':
			queryClient.invalidateQueries({ queryKey: itemsKeys.byList(listId) })
			return
		case 'comment':
			if (mode === 'organize') return
			queryClient.invalidateQueries({ queryKey: ['item-comments', event.itemId] })
			return
		case 'addon':
			if (mode === 'organize') return
			void router.invalidate()
			return
		case 'list':
			void router.invalidate()
			return
	}
}

export function useListSSE(listId: number, mode: ListSSEMode = 'gifter') {
	const router = useRouter()
	const queryClient = useQueryClient()

	useEffect(() => {
		if (typeof window === 'undefined') return

		let es: EventSource | null = null
		try {
			es = new EventSource(`/api/sse/list/${listId}`)

			es.onmessage = ev => {
				let event: ListEvent
				try {
					event = JSON.parse(ev.data) as ListEvent
				} catch {
					return
				}
				dispatchListEvent(event, { queryClient, router, listId, mode })
			}

			es.onerror = () => {
				// EventSource auto-reconnects. refetch-on-focus covers gaps.
			}
		} catch {
			// EventSource not available in this environment.
		}

		return () => {
			es?.close()
		}
	}, [listId, mode, router, queryClient])
}
