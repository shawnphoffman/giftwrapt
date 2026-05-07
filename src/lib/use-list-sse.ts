import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

import { itemsKeys } from '@/lib/queries/items'
import type { ListEvent } from '@/routes/api/sse/list.$listId'

/**
 * Connects to the SSE endpoint for a given list and dispatches narrow
 * invalidations per typed `ListEvent` kind on the per-list channel
 * (gifter view of `/lists/$listId`).
 *
 * Dispatch policy (matches the plan's subscriber map):
 *  - claim: refresh the items query (item.gifts changed).
 *  - item:  refresh the items query (covers add / update / remove).
 *  - comment: refresh that item's comment thread, NOT the items query.
 *  - addon: invalidate the route loader; addons live on `list.addons`.
 *  - list:  invalidate the route loader (list metadata changed).
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
					case 'item':
						queryClient.invalidateQueries({ queryKey: itemsKeys.byList(listId) })
						break
					case 'comment':
						queryClient.invalidateQueries({ queryKey: ['item-comments', event.itemId] })
						break
					case 'addon':
					case 'list':
						router.invalidate()
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
