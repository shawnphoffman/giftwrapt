import { getSessionUser, getUser } from '@/app/actions/auth'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar'

export async function NavUser() {
	const currentUserPromise = getUser()
	const sessionPromise = getSessionUser()
	// const fakePromise = new Promise(resolve => setTimeout(resolve, 5000))

	const [{ data: currentUser }, sessionUser] = await Promise.all([
		currentUserPromise,
		sessionPromise,
		// fakePromise
	])

	// console.log('XXX', { currentUser, sessionUser })

	if (!currentUser?.display_name) {
		return null
	}

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<div className="flex items-center w-full gap-2 p-2 overflow-hidden text-sm text-left rounded-md outline-none">
					{/* TODO Refactor this to be reusable */}
					<Avatar className="w-8 h-8 rounded-lg">
						<AvatarImage src={currentUser?.image} key={currentUser?.id} />
						<AvatarFallback className="font-bold rounded-lg">{currentUser?.display_name?.charAt(0)}</AvatarFallback>
					</Avatar>
					<div className="grid flex-1 text-sm leading-tight text-left">
						<span className="font-semibold truncate">{currentUser.display_name}</span>
						{sessionUser?.email && <span className="text-xs truncate">{sessionUser.email}</span>}
					</div>
				</div>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
