import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import type { ListEvent } from '@/routes/api/sse/list.$listId'

type DispatchDeps = {
	queryClient: Pick<QueryClient, 'invalidateQueries'>
}

/**
 * Pure dispatcher for `/recent.items`. Cares about claim and item events
 * (any shape - the feed shows recently changed items, including title /
 * priority / availability edits). Comment, addon, and list events do not
 * shift the recent-items feed.
 *
 * Per-list filtering is intentionally NOT done here: the any-list channel
 * broadcasts everything, the refetched query returns only what the viewer
 * can see (existing permission + window logic in `getRecentItems`).
 */
export function dispatchRecentItemsEvent(event: ListEvent, deps: DispatchDeps): void {
	switch (event.kind) {
		case 'claim':
		case 'item':
			deps.queryClient.invalidateQueries({ queryKey: ['recent', 'items'] })
			return
		case 'comment':
		case 'addon':
		case 'list':
			return
	}
}

export function useRecentItemsSSE() {
	const queryClient = useQueryClient()

	useEffect(() => {
		if (typeof window === 'undefined') return

		let es: EventSource | null = null
		try {
			es = new EventSource('/api/sse/lists')

			es.onmessage = ev => {
				let event: ListEvent
				try {
					event = JSON.parse(ev.data) as ListEvent
				} catch {
					return
				}
				dispatchRecentItemsEvent(event, { queryClient })
			}

			es.onerror = () => {
				// EventSource auto-reconnects. Nothing to do.
			}
		} catch {
			// EventSource not available. Silent fail.
		}

		return () => {
			es?.close()
		}
	}, [queryClient])
}
