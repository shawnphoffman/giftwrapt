import { Link, useLocation } from '@tanstack/react-router'
import { Cake, Gift } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function navLinkClass(active: boolean) {
	return cn(buttonVariants({ variant: 'ghost' }), 'justify-start w-full', active && 'bg-muted text-foreground hover:bg-muted')
}

export default function TempLinks() {
	const { pathname } = useLocation()

	return (
		<>
			<Link to="/temp" className={navLinkClass(pathname === '/temp' || pathname === '/temp/')}>
				<Gift />
				Holidays
			</Link>
			<Link to="/temp/birthdays" className={navLinkClass(pathname === '/temp/birthdays')}>
				<Cake />
				Birthdays
			</Link>
		</>
	)
}
