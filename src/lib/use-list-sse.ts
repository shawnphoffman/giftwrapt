import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

import { itemsKeys } from '@/lib/queries/items'

/**
 * Connects to the SSE endpoint for a given list and refreshes both the
 * route loader (list metadata, addons, groups) and the items React Query
 * cache when changes arrive.
 *
 * SSE messages don't carry payload kind, so any event means "something on
 * this list changed somewhere," so both refresh paths fire. If the
 * channel ever grows enough traffic to make this wasteful, gate by event
 * kind.
 */
export function useListSSE(listId: number) {
	const router = useRouter()
	const queryClient = useQueryClient()

	useEffect(() => {
		if (typeof window === 'undefined') return

		let es: EventSource | null = null
		try {
			es = new EventSource(`/api/sse/list/${listId}`)

			es.onmessage = () => {
				router.invalidate()
				queryClient.invalidateQueries({ queryKey: itemsKeys.byList(listId) })
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
	}, [listId, router, queryClient])
}
