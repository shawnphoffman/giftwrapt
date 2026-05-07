import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import type { ListEvent } from '@/routes/api/sse/list.$listId'

type DispatchDeps = {
	queryClient: Pick<QueryClient, 'invalidateQueries'>
}

/**
 * Pure dispatcher for `/recent.comments`. Only comment events refresh
 * the conversations feed; everything else is a no-op. Per-list filtering
 * is left to the refetched query's existing permission logic.
 */
export function dispatchRecentCommentsEvent(event: ListEvent, deps: DispatchDeps): void {
	if (event.kind === 'comment') {
		deps.queryClient.invalidateQueries({ queryKey: ['recent', 'conversations'] })
	}
}

export function useRecentCommentsSSE() {
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
				dispatchRecentCommentsEvent(event, { queryClient })
			}

			es.onerror = () => {
				// EventSource auto-reconnects.
			}
		} catch {
			// EventSource not available.
		}

		return () => {
			es?.close()
		}
	}, [queryClient])
}
