'use client'

import { useEffect } from 'react'
import { useLocation } from '@tanstack/react-router'

import { useSidebar } from '@/components/ui/sidebar'

export function NavigationEvents() {
	const location = useLocation()
	const { setOpenMobile, isMobile } = useSidebar()

	useEffect(() => {
		if (isMobile) {
			// console.log('closing mobile sidebar')
			setOpenMobile(false)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [location.pathname, isMobile])

	return null
}
