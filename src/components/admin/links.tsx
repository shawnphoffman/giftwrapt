import { Link, useLocation } from '@tanstack/react-router'
import { Bug, Database, FlaskConical, Lock, Users } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function navLinkClass(active: boolean) {
	return cn(
		buttonVariants({ variant: 'ghost' }),
		'justify-start w-full',
		active && 'bg-muted text-foreground hover:bg-muted',
	)
}

export default function AdminLinks() {
	const { pathname } = useLocation()

	return (
		<>
			<Link to="/admin" className={navLinkClass(pathname === '/admin')}>
				<Lock />
				General
			</Link>
			<Link
				to="/admin/users"
				className={navLinkClass(pathname === '/admin/users' || pathname.startsWith('/admin/user/'))}
			>
				<Users />
				Users
			</Link>
			<Link to="/admin/data" className={navLinkClass(pathname === '/admin/data')}>
				<Database />
				Data
			</Link>
			<Link to="/admin/debug" className={navLinkClass(pathname === '/admin/debug')}>
				<Bug />
				Debug
			</Link>
			<Link to="/admin/test" className={navLinkClass(pathname === '/admin/test')}>
				<FlaskConical />
				Test
			</Link>
		</>
	)
}
