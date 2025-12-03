import { Lock } from 'lucide-react'

import { NavItem } from './nav-section'
import { useSession } from '@/lib/auth-client'

export default function AdminNavLink() {
	const { data: session } = useSession()
	if (!session?.user?.isAdmin) {
		return null
	}

	const item: NavItem = {
		name: 'Admin',
		url: '/admin',
		icon: Lock,
		hoverColor: 'group-hover/link:text-red-400',
	}

	return <NavItem item={item} className="text-red-500 hover:text-red-500" />
}
