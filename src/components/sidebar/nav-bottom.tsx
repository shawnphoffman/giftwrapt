import { Suspense } from 'react'
import { faCog } from '@awesome.me/kit-f973af7de0/icons/sharp-duotone/solid'

import { isImpersonating } from '@/app/actions/admin'
import { SidebarGroup, SidebarGroupContent, SidebarMenu } from '@/components/ui/sidebar'

import { NavItem } from './nav-section'
import StopImpersonatingButton from './StopImpersonatingButton'
import AdminNavLink from '../admin/AdminNavLink'

const items: NavItem[] = [
	{
		name: 'Settings',
		url: '/settings',
		icon: faCog,
	},
]

export default async function NavBottom() {
	let impersonating = await isImpersonating()
	// console.log('impersonating user:', impersonating)
	return (
		<SidebarGroup className="mt-auto">
			<SidebarGroupContent>
				<SidebarMenu>
					{/*  */}
					<Suspense fallback={null}>
						<StopImpersonatingButton impersonating={impersonating} />
					</Suspense>
					{/*  */}
					<Suspense fallback={null}>
						<AdminNavLink />
					</Suspense>
					{/*  */}
					{items.map(item => (
						<NavItem key={item.name} item={item} />
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	)
}
