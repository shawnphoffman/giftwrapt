import { SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar'
import { useSession } from '@/lib/auth-client'

import UserAvatar from '../common/user-avatar'

export function NavUser() {
	const { data: session } = useSession()

	if (!session?.user) {
		return null
	}

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<div className="flex items-center w-full gap-2 p-2 overflow-hidden text-sm text-left rounded-md outline-none">
					<UserAvatar name={session.user.name || session.user.email} image={session.user.image} className="rounded-lg" />
					<div className="grid flex-1 text-sm leading-tight text-left">
						<span className="font-semibold truncate">{session.user.name}</span>
						{session.user.email && <span className="text-xs truncate">{session.user.email}</span>}
					</div>
				</div>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
