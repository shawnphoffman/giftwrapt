import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar'
import { useSession } from '@/lib/auth-client'

export function NavUser() {
	const { data: session } = useSession()

	if (!session?.user) {
		return null
	}

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<div className="flex items-center w-full gap-2 p-2 overflow-hidden text-sm text-left rounded-md outline-none">
					{/* TODO Refactor this to be reusable */}
					<Avatar className="w-8 h-8 rounded-lg">
						<AvatarImage src={session.user.image || ''} key={session.user.id} />
						<AvatarFallback className="font-bold rounded-lg">{session.user.name?.charAt(0)}</AvatarFallback>
					</Avatar>
					<div className="grid flex-1 text-sm leading-tight text-left">
						<span className="font-semibold truncate">{session.user.name}</span>
						{session.user.email && <span className="text-xs truncate">{session.user.email}</span>}
					</div>
				</div>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
