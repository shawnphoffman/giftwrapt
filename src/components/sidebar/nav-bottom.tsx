import { SidebarGroup, SidebarGroupContent, SidebarMenu } from '@/components/ui/sidebar'

import { NavItem } from './nav-section'
import { Settings } from 'lucide-react'
import AdminNavLink from './nav-admin-link'
import StopImpersonationLink from './stop-impersonation-link'

const items: NavItem[] = [
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
