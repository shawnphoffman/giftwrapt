import { WandSparkles } from 'lucide-react'

import { useAppSetting } from '@/hooks/use-app-settings'
import { useSession } from '@/lib/auth-client'

import { NavItem } from './nav-section'

export default function AdminIntelligenceNavLink() {
	const { data: session } = useSession()
	const enabled = useAppSetting('intelligenceEnabled')

	if (!session?.user.isAdmin || !enabled) {
		return null
	}

	const item: NavItem = {
		name: 'Intelligence',
		url: '/admin/intelligence',
		icon: WandSparkles,
		hoverColor:
			'group-hover/link:text-fuchsia-500 group-data-[status=active]/link:text-fuchsia-500 group-data-[status=active]/link:animate-throb',
		activeMatch: p => p === '/admin/intelligence' || p.startsWith('/admin/intelligence/'),
	}

	return (
		<NavItem
			item={item}
			className="bg-gradient-to-r from-amber-500/10 via-pink-500/10 to-fuchsia-500/10 hover:from-amber-500/20 hover:via-pink-500/20 hover:to-fuchsia-500/20 text-fuchsia-600 dark:text-fuchsia-300 hover:text-fuchsia-600 dark:hover:text-fuchsia-300"
		/>
	)
}
