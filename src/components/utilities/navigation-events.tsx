'use client'

import { useLocation } from '@tanstack/react-router'
import { useEffect } from 'react'

import { useSidebar } from '@/components/ui/sidebar'

export function NavigationEvents() {
	const location = useLocation()
	const { setOpenMobile, isMobile } = useSidebar()

	useEffect(() => {
		if (isMobile) {
			setOpenMobile(false)
		}
	}, [location.pathname, isMobile])

	return null
}
