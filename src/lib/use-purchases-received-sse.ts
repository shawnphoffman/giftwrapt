import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

import type { ListEvent } from '@/routes/api/sse/list.$listId'

type DispatchDeps = {
	router: { invalidate: () => void | Promise<unknown> }
}

/**
 * Pure dispatcher for `/purchases/received`. Loader-driven page; refresh
 * via `router.invalidate()`.
 *
 * Cares about `claim` and `addon`. Per .notes/logic.md the received-gifts
 * query only surfaces items where `items.isArchived = true` (the recipient
 * has revealed them), so most claim events are no-ops in the rendered
 * data - the refetch is cheap and keeps the page consistent. The reveal
 * itself is `archiveItem`, which fires `kind: 'item'` (no shape) per PR 2;
 * that surfaces newly-revealed items here too.
 */
export function dispatchPurchasesReceivedEvent(event: ListEvent, deps: DispatchDeps): void {
	switch (event.kind) {
		case 'claim':
		case 'addon':
		case 'item':
			void deps.router.invalidate()
			return
		case 'comment':
		case 'list':
			return
	}
}

export function usePurchasesReceivedSSE() {
	const router = useRouter()

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
				dispatchPurchasesReceivedEvent(event, { router })
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
	}, [router])
}
