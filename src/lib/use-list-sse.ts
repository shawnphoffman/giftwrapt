import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

import { itemsKeys } from '@/lib/queries/items'
import type { ListEvent } from '@/routes/api/sse/list.$listId'

/**
 * Connects to the SSE endpoint for a given list and dispatches narrow
 * invalidations per typed `ListEvent` kind. Only `kind: 'list'` invalidates
 * the route loader (list metadata, addons, groups). Item / comment / addon
 * kinds are no-ops in PR 1; their handlers land alongside mutation
 * instrumentation in PR 2.
 */
export function useListSSE(listId: number) {
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
				switch (event.kind) {
					case 'claim':
						queryClient.invalidateQueries({ queryKey: itemsKeys.byList(listId) })
						break
					case 'list':
						router.invalidate()
						break
					case 'item':
					case 'comment':
					case 'addon':
						// Wired up in PR 2 alongside mutation instrumentation.
						break
				}
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
