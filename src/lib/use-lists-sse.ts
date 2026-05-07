import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import type { ListEvent } from '@/routes/api/sse/list.$listId'

/**
 * Subscribes to the "any list changed" SSE channel and invalidates the
 * grouped public-lists query so the home-page unclaimed/total badges stay
 * live when anyone (you or someone else) claims or unclaims on any list.
 *
 * Dispatches per typed `ListEvent` kind. PR 1 handles `claim`; other kinds
 * are no-ops until their mutation paths are instrumented in PR 2 (only
 * kinds that affect badge counts will invalidate then: `claim`, `item.shape`,
 * `list`).
 *
 * Fails closed: if EventSource is unavailable, callers still pick up
 * changes via the claimant's own client-side invalidation and the usual
 * stale-time / focus-refetch fallbacks.
 */
export function useListsSSE() {
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
				switch (event.kind) {
					case 'claim':
						queryClient.invalidateQueries({ queryKey: ['lists', 'public', 'grouped'] })
						break
					case 'item':
					case 'comment':
					case 'addon':
					case 'list':
						// Wired up in PR 2 alongside mutation instrumentation.
						break
				}
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
