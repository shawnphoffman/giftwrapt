import { Lock } from 'lucide-react'

import { useSession } from '@/lib/auth-client'
import { m } from '@/paraglide/messages.js'

import { NavItem } from './nav-section'

export default function AdminNavLink() {
	const { data: session } = useSession()
	if (!session?.user.isAdmin) {
		return null
	}

	const item: NavItem = {
		name: () => m.nav_admin(),
		url: '/admin',
		icon: Lock,
		hoverColor: 'group-hover/link:text-red-400 group-data-[status=active]/link:animate-pulse',
	}

	return <NavItem item={item} className="text-red-500 hover:text-red-500" />
}
