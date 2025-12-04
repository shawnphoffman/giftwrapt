import { Settings } from 'lucide-react'

import { SidebarGroup, SidebarGroupContent, SidebarMenu } from '@/components/ui/sidebar'

import AdminNavLink from './nav-admin-link'
import { NavItem } from './nav-section'
import StopImpersonationLink from './stop-impersonation-link'

const items: Array<NavItem> = [
	{
		name: 'Settings',
		url: '/settings',
		icon: Settings,
		hoverColor: 'group-hover/link:text-lime-500',
	},
]

export default function NavBottom() {
	return (
		<SidebarGroup className="mt-auto">
			<SidebarGroupContent>
				<SidebarMenu>
					<StopImpersonationLink />
					<AdminNavLink />
					{items.map(item => (
						<NavItem key={item.name} item={item} />
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	)
}
