import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

type DispatchDeps = {
	router: { invalidate: () => void | Promise<unknown> }
}

import type { ListEvent } from '@/routes/api/sse/list.$listId'

/**
 * Pure dispatcher for `/purchases`. The page is route-loader-driven (not a
 * React Query cache), so refresh = `router.invalidate()`. Only `claim`
 * events shift purchase data. Per-user filtering (own + partner per the
 * gift-credit predicate at src/api/purchases.ts:67) lives in the loader.
 */
export function dispatchPurchasesEvent(event: ListEvent, deps: DispatchDeps): void {
	if (event.kind === 'claim') {
		void deps.router.invalidate()
	}
}

export function usePurchasesSSE() {
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
				dispatchPurchasesEvent(event, { router })
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
