'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ThemeSwitcher({ className }: { className?: string }) {
	const { theme, setTheme } = useTheme()
	const [mounted, setMounted] = useState(false)

	// Avoid hydration mismatch
	useEffect(() => {
		setMounted(true)
	}, [])

	const buttonClasses = cn(
		'size-8 mx-auto group-data-[collapsible=icon]:size-10 transition-[width,height] duration-200 ease-linear',
		className
	)
	const iconClasses = 'size-4 group-data-[collapsible=icon]:size-6 transition-[width,height] duration-200 ease-linear'

	if (!mounted) {
		return (
			<Button variant="ghost" size="icon" className={buttonClasses} disabled={true} suppressHydrationWarning>
				<Moon className={iconClasses} />
			</Button>
		)
	}

	const isDark = theme === 'dark'

	return (
		<Button
			variant="ghost"
			size="icon"
			className={buttonClasses}
			onClick={() => setTheme(isDark ? 'light' : 'dark')}
			aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
		>
			{isDark ? <Moon className={iconClasses} /> : <Sun className={iconClasses} />}
		</Button>
	)
}
