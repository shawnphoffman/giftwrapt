import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

import { itemsKeys } from '@/lib/queries/items'

const POLL_INTERVAL_MS = 30_000

/**
 * Backstop refresher for the list-detail surfaces.
 *
 * `useListSSE` gives instant updates when the mutating user and the viewing
 * user happen to share a server process. That's true on long-running
 * deployments (Docker, Railway, Render) but only best-effort on Vercel,
 * where each function invocation is its own isolate and the in-memory
 * subscriber map doesn't reach across them.
 *
 * This hook covers the gap with three signals:
 *  - tab focus
 *  - document becoming visible (mobile tab-switch)
 *  - a 30s interval, ONLY while the document is visible
 *
 * Each signal invalidates both the items React Query and the route loader
 * (which carries addons). Refresh is silent: `useSuspenseQuery` refetches
 * in place, `router.invalidate` re-runs the loader without unmounting, so
 * no skeleton flashes. TanStack Query and Router both dedupe in-flight
 * work by key, so overlapping signals don't double-fetch.
 */
export function useListAutoRefresh(listId: number) {
	const queryClient = useQueryClient()
	const router = useRouter()

	useEffect(() => {
		if (typeof window === 'undefined') return

		let intervalId: number | undefined

		const refresh = () => {
			queryClient.invalidateQueries({ queryKey: itemsKeys.byList(listId) })
			void router.invalidate()
		}

		const startTimer = () => {
			if (intervalId !== undefined) return
			intervalId = window.setInterval(refresh, POLL_INTERVAL_MS)
		}

		const stopTimer = () => {
			if (intervalId === undefined) return
			window.clearInterval(intervalId)
			intervalId = undefined
		}

		const onVisibility = () => {
			if (document.visibilityState === 'visible') {
				refresh()
				startTimer()
			} else {
				stopTimer()
			}
		}

		if (document.visibilityState === 'visible') startTimer()
		document.addEventListener('visibilitychange', onVisibility)
		window.addEventListener('focus', refresh)

		return () => {
			stopTimer()
			document.removeEventListener('visibilitychange', onVisibility)
			window.removeEventListener('focus', refresh)
		}
	}, [listId, queryClient, router])
}
