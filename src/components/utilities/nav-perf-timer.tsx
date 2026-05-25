'use client'

import { useRouterState } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

import { perfEnabled, perfLog } from '@/lib/observability/perf'

// Logs `click -> first paint` (and `click -> settled`) latency for every
// client-side route transition, gated on VITE_PERF_DEBUG. The metric of
// interest is the transition itself (perceived "page changed"), not the
// total time until all data lands.
export function NavPerfTimer() {
	const status = useRouterState({ select: s => s.status })
	const location = useRouterState({ select: s => s.location.pathname })
	const clickAtRef = useRef<number | null>(null)
	const pendingStartRef = useRef<number | null>(null)
	const prevStatusRef = useRef<typeof status>(status)
	const prevPathRef = useRef<string>(location)

	useEffect(() => {
		if (!perfEnabled) return
		const onClick = (e: MouseEvent) => {
			const target = e.target as HTMLElement | null
			if (!target) return
			const anchor = target.closest('a[href]')
			if (!anchor) return
			clickAtRef.current = performance.now()
		}
		document.addEventListener('click', onClick, { capture: true })
		return () => document.removeEventListener('click', onClick, { capture: true } as EventListenerOptions)
	}, [])

	useEffect(() => {
		if (!perfEnabled) return
		const prev = prevStatusRef.current
		const prevPath = prevPathRef.current
		if (prev !== 'pending' && status === 'pending') {
			pendingStartRef.current = performance.now()
			perfLog('nav:pending-start', { from: prevPath, click: clickAtRef.current })
		}
		if (prev === 'pending' && status === 'idle') {
			const now = performance.now()
			const click = clickAtRef.current
			const pendingStart = pendingStartRef.current
			requestAnimationFrame(() => {
				const paint = performance.now()
				perfLog('nav:first-paint', {
					to: location,
					from: prevPath,
					clickToFirstPaint: click != null ? Math.round(paint - click) : null,
					loaderTime: pendingStart != null ? Math.round(now - pendingStart) : null,
				})
			})
			clickAtRef.current = null
			pendingStartRef.current = null
		}
		prevStatusRef.current = status
		prevPathRef.current = location
	}, [status, location])

	return null
}
