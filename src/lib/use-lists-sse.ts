import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

/**
 * Subscribes to the "any list changed" SSE channel and invalidates the
 * grouped public-lists query so the home-page unclaimed/total badges stay
 * live when anyone (you or someone else) claims or unclaims on any list.
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

			es.onmessage = () => {
				queryClient.invalidateQueries({ queryKey: ['lists', 'public', 'grouped'] })
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
