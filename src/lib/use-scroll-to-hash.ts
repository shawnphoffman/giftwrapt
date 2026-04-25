import { useLocation } from '@tanstack/react-router'
import { useEffect } from 'react'

/**
 * Scrolls to the element whose id matches the current URL hash.
 *
 * Items render synchronously, but comments load lazily via React Query, so
 * the target element may not be in the DOM when the page first mounts. We
 * poll a handful of frames before giving up.
 */
export function useScrollToHash(deps: ReadonlyArray<unknown> = []) {
	const hash = useLocation({ select: l => l.hash })

	useEffect(() => {
		if (!hash) return
		let cancelled = false
		let attempts = 0
		const tryScroll = () => {
			if (cancelled) return
			const el = document.getElementById(hash)
			if (el) {
				el.scrollIntoView({ behavior: 'smooth', block: 'center' })
				return
			}
			if (attempts++ < 20) setTimeout(tryScroll, 100)
		}
		tryScroll()
		return () => {
			cancelled = true
		}
	}, [hash, ...deps])
}
