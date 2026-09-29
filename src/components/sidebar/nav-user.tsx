import { SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '@/lib/auth-client'

import UserAvatar from '../common/user-avatar'

type FooterUser = { name: string | null; email: string; image: string | null }

// `initialUser` comes from the (core) route's beforeLoad, so SSR and the
// hydrating render show the signed-in user (useSession reports pending until
// hydration finishes). The live session takes over after that, so a profile
// edit that refetches the session shows up here without a navigation.
export function NavUser({ initialUser }: { initialUser?: FooterUser }) {
	const { data: session } = useSession()
	const user = session?.user ?? initialUser

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				{!user ? (
					<div className="flex items-center w-full gap-2 p-2 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center">
						<Skeleton className="h-8 w-8 rounded-lg" />
						<div className="grid flex-1 gap-1 group-data-[collapsible=icon]:hidden">
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-3 w-32" />
						</div>
					</div>
				) : (
					<div className="flex items-center w-full gap-2 p-2 overflow-hidden text-sm text-left rounded-md outline-none group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center">
						<UserAvatar name={user.name || user.email} image={user.image} />
						<div className="grid flex-1 text-sm leading-tight text-left group-data-[collapsible=icon]:hidden">
							<span className="font-semibold truncate">{user.name}</span>
							{user.email && <span className="text-xs truncate">{user.email}</span>}
						</div>
					</div>
				)}
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
