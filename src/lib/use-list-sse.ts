import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

/**
 * Hook that connects to the SSE endpoint for a given list and
 * invalidates the TanStack Router cache when changes arrive.
 *
 * Falls back gracefully if SSE is unavailable — TanStack Query's
 * refetch-on-focus will still keep data reasonably fresh.
 */
export function useListSSE(listId: number) {
	const router = useRouter()

	useEffect(() => {
		// SSE is client-only.
		if (typeof window === 'undefined') return

		let es: EventSource | null = null
		try {
			es = new EventSource(`/api/sse/list/${listId}`)

			es.onmessage = () => {
				// Any message = something changed on this list. Invalidate
				// the router to re-run loaders.
				router.invalidate()
			}

			es.onerror = () => {
				// Connection lost — EventSource auto-reconnects by default.
				// Nothing to do here; the refetch-on-focus fallback covers gaps.
			}
		} catch {
			// EventSource not available in this environment. Silent fail.
		}

		return () => {
			es?.close()
		}
	}, [listId, router])
}
