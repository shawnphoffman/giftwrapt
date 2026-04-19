import { Link, useLocation } from '@tanstack/react-router'
import { Bug, FlaskConical, Users } from 'lucide-react'

import { cn } from '@/lib/utils'

export default function AdminLinks() {
	const location = useLocation()
	const pathname = location.pathname

	const passiveClasses = ''
	const activeClasses = 'font-semibold text-primary'
	const iconClasses = 'flex flex-row items-center gap-1'

	return (
		<>
			<Link to="/admin" className={pathname === '/admin' ? activeClasses : ''}>
				General
			</Link>
			<Link
				to="/admin/users"
				className={cn(pathname === '/admin/users' || pathname.startsWith('/admin/user/') ? activeClasses : '', passiveClasses, iconClasses)}
			>
				<Users size={16} />
				Users
			</Link>
			<Link to="/admin/debug" className={cn(pathname === '/admin/debug' ? activeClasses : '', passiveClasses, iconClasses)}>
				<Bug size={16} />
				Debug
			</Link>
			<Link to="/admin/test" className={cn(pathname === '/admin/test' ? activeClasses : '', passiveClasses, iconClasses)}>
				<FlaskConical size={16} />
				Test
			</Link>
		</>
	)
}
