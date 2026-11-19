import { Link, useLocation } from '@tanstack/react-router'
import { Cake, Gift } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

function navLinkClass(active: boolean) {
	// A label longer than the column wraps onto a second line, tight to the
	// first, instead of spilling over the page beside it (French labels do).
	return cn(
		buttonVariants({ variant: 'ghost' }),
		'justify-start w-full h-auto min-h-9 py-1.5 text-left leading-tight whitespace-normal',
		active && 'bg-muted text-foreground hover:bg-muted'
	)
}

export default function TempLinks() {
	const { pathname } = useLocation()

	return (
		<>
			<Link to="/temp" className={navLinkClass(pathname === '/temp' || pathname === '/temp/')}>
				<Gift />
				{m.admin_temp_nav_holidays()}
			</Link>
			<Link to="/temp/birthdays" className={navLinkClass(pathname === '/temp/birthdays')}>
				<Cake />
				{m.admin_temp_nav_birthdays()}
			</Link>
		</>
	)
}
