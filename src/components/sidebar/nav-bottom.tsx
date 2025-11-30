// import { Suspense } from 'react'

// import { isImpersonating } from '@/app/actions/admin'
import { SidebarGroup, SidebarGroupContent, SidebarMenu } from '@/components/ui/sidebar'

import { NavItem } from './nav-section'
import { Settings } from 'lucide-react'
// import StopImpersonatingButton from './StopImpersonatingButton'
import AdminNavLink from './nav-admin-link'

const items: NavItem[] = [
	{
		name: 'Settings',
		url: '/settings',
		icon: Settings,
		hoverColor: 'group-hover/link:text-lime-500',
	},
]

export default function NavBottom() {
	// let impersonating = await isImpersonating()
	// console.log('impersonating user:', impersonating)
	return (
		<SidebarGroup className="mt-auto">
			<SidebarGroupContent>
				<SidebarMenu>
					{/*  */}
					{/* <Suspense fallback={null}>
						<StopImpersonatingButton impersonating={impersonating} />
					</Suspense> */}
					{/*  */}
					{/* <Suspense fallback={null}> */}
					<AdminNavLink />
					{/* </Suspense> */}
					{/*  */}
					{items.map(item => (
						<NavItem key={item.name} item={item} />
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	)
}
