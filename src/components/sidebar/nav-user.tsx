import { SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '@/lib/auth-client'

import UserAvatar from '../common/user-avatar'

export function NavUser() {
	const { data: session, isPending } = useSession()

	// Always render the same structure to avoid hydration mismatch
	// The content changes but the outer elements remain consistent
	return (
		<SidebarMenu>
			<SidebarMenuItem>
				{isPending || !session?.user ? (
					<div className="flex items-center w-full gap-2 p-2 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center">
						<Skeleton className="h-8 w-8 rounded-lg" />
						<div className="grid flex-1 gap-1 group-data-[collapsible=icon]:hidden">
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-3 w-32" />
						</div>
					</div>
				) : (
					<div className="flex items-center w-full gap-2 p-2 overflow-hidden text-sm text-left rounded-md outline-none group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center">
						<UserAvatar name={session.user.name || session.user.email} image={session.user.image} />
						<div className="grid flex-1 text-sm leading-tight text-left group-data-[collapsible=icon]:hidden">
							<span className="font-semibold truncate">{session.user.name}</span>
							{session.user.email && <span className="text-xs truncate">{session.user.email}</span>}
						</div>
					</div>
				)}
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
