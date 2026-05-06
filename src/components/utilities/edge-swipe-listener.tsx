'use client'

import { useEffect } from 'react'

import { useSidebar } from '@/components/ui/sidebar'

const EDGE_THRESHOLD_PX = 24
const ACTIVATE_THRESHOLD_PX = 10
const COMMIT_THRESHOLD_PX = 60

// Intercepts touches that begin within `EDGE_THRESHOLD_PX` of either screen
// edge and, once the gesture is clearly horizontal, suppresses the browser's
// default action (iOS Safari's swipe-back / swipe-forward navigation) by
// preventing default on touchmove. A right-going swipe from the left edge
// also opens the mobile sidebar so the gesture isn't dead.
//
// Mobile-only - desktop touch screens are rare here and the sidebar uses a
// different (always-visible) variant on md+.
export function EdgeSwipeListener() {
	const { setOpenMobile, openMobile, isMobile } = useSidebar()

	useEffect(() => {
		if (!isMobile) return
		// While the sheet is already open, let Radix's own swipe-to-close
		// handlers do their thing.
		if (openMobile) return

		let startX = 0
		let startY = 0
		let edge: 'left' | 'right' | null = null
		let committed = false

		const onTouchStart = (e: TouchEvent) => {
			const t = e.touches[0]
			const w = window.innerWidth
			if (t.clientX <= EDGE_THRESHOLD_PX) edge = 'left'
			else if (t.clientX >= w - EDGE_THRESHOLD_PX) edge = 'right'
			else edge = null
			if (!edge) return
			startX = t.clientX
			startY = t.clientY
			committed = false
		}

		const onTouchMove = (e: TouchEvent) => {
			if (!edge) return
			const t = e.touches[0]
			const dx = t.clientX - startX
			const dy = t.clientY - startY
			const absX = Math.abs(dx)
			const absY = Math.abs(dy)

			// Vertical scroll wins - bail and let the page scroll normally.
			if (absY > ACTIVATE_THRESHOLD_PX && absY > absX) {
				edge = null
				return
			}

			// Once it's clearly horizontal, suppress the browser's edge gesture.
			if (absX > ACTIVATE_THRESHOLD_PX && absX >= absY) {
				if (e.cancelable) e.preventDefault()
				if (!committed && edge === 'left' && dx > COMMIT_THRESHOLD_PX) {
					committed = true
					setOpenMobile(true)
				}
			}
		}

		const onTouchEnd = () => {
			edge = null
			committed = false
		}

		// `passive: false` is required so preventDefault can suppress the
		// native swipe-back gesture on iOS.
		document.addEventListener('touchstart', onTouchStart, { passive: true })
		document.addEventListener('touchmove', onTouchMove, { passive: false })
		document.addEventListener('touchend', onTouchEnd, { passive: true })
		document.addEventListener('touchcancel', onTouchEnd, { passive: true })

		return () => {
			document.removeEventListener('touchstart', onTouchStart)
			document.removeEventListener('touchmove', onTouchMove)
			document.removeEventListener('touchend', onTouchEnd)
			document.removeEventListener('touchcancel', onTouchEnd)
		}
	}, [isMobile, openMobile, setOpenMobile])

	return null
}
