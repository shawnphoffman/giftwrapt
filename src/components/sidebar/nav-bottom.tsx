import { Settings } from 'lucide-react'

import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar'

import { ThemeSwitcher } from '../ui/theme-switcher'
import AdminIntelligenceNavLink from './nav-admin-intelligence-link'
import AdminNavLink from './nav-admin-link'
import { NavItem } from './nav-section'
import NavVersionLink from './nav-version-link'
import StopImpersonationLink from './stop-impersonation-link'

export default function NavBottom() {
	return (
		<SidebarGroup className="mt-auto">
			<SidebarGroupContent>
				<SidebarMenu>
					<SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
						<NavVersionLink />
					</SidebarMenuItem>
					<StopImpersonationLink />
					<AdminIntelligenceNavLink />
					<AdminNavLink />
					{/* {items.map(item => (
						<NavItem key={item.name} item={item} />
					))} */}
					<div className="flex flex-row gap-2 w-full justify-between group-data-[collapsible=icon]:flex-col">
						<NavItem
							item={{
								name: 'Settings',
								url: '/settings',
								icon: Settings,
								hoverColor: 'group-hover/link:text-lime-500 group-data-[status=active]/link:text-lime-500',
							}}
							className="w-full flex-1"
						/>
						<ThemeSwitcher className="cursor-pointer" />
					</div>
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	)
}
