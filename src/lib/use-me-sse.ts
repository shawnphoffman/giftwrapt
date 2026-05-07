import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

import type { ListEvent } from '@/routes/api/sse/list.$listId'

type DispatchDeps = {
	queryClient: Pick<QueryClient, 'invalidateQueries'>
	router: { invalidate: () => void | Promise<unknown> }
}

/**
 * Pure dispatcher for the `/me` surface. Cares about events that move
 * counts on owned/editable list rows, plus list-shape changes that
 * add/remove/rename a list in the user's surface.
 *
 * Item updates without `shape` (rename, priority, availability) and
 * comment/addon events do NOT trigger `/me` refresh in v1: they don't
 * shift any rendered counts on this page.
 *
 * Exported for unit tests.
 */
export function dispatchMeEvent(event: ListEvent, deps: DispatchDeps): void {
	const { queryClient, router } = deps
	switch (event.kind) {
		case 'claim':
			queryClient.invalidateQueries({ queryKey: ['my-lists'] })
			return
		case 'item':
			if (event.shape) {
				queryClient.invalidateQueries({ queryKey: ['my-lists'] })
			}
			return
		case 'list':
			queryClient.invalidateQueries({ queryKey: ['my-lists'] })
			void router.invalidate()
			return
		case 'comment':
		case 'addon':
			return
	}
}

/**
 * Subscribes the `/me` page to the any-list SSE channel. Fails closed:
 * when EventSource isn't available, the page still picks up changes via
 * the React Query staleTime + refetchOnMount fallbacks on next visit.
 */
export function useMeSSE() {
	const router = useRouter()
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
				dispatchMeEvent(event, { queryClient, router })
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
	}, [router, queryClient])
}
