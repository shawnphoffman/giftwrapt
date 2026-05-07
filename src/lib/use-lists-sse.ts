import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import type { ListEvent } from '@/routes/api/sse/list.$listId'

/**
 * Subscribes to the "any list changed" SSE channel and invalidates the
 * grouped public-lists query so the home-page unclaimed/total badges stay
 * live as users mutate anywhere.
 *
 * Only kinds that move badge counts trigger an invalidate:
 *  - claim:                claim/unclaim shifts unclaimed/total counters.
 *  - item with `shape`:    add/remove of items moves totals.
 *  - list (any shape):     a new/removed/archived list reshapes the feed.
 *
 * `item` without shape (rename, priority, availability, archive-reveal),
 * `comment`, and `addon` don't move counts and are dropped here.
 *
 * Fails closed: if EventSource is unavailable, callers still pick up
 * changes via stale-time / focus-refetch fallbacks.
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
				let invalidate = false
				switch (event.kind) {
					case 'claim':
					case 'list':
						invalidate = true
						break
					case 'item':
						invalidate = !!event.shape
						break
					case 'comment':
					case 'addon':
						break
				}
				if (invalidate) {
					queryClient.invalidateQueries({ queryKey: ['lists', 'public', 'grouped'] })
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
