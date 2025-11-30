import { createFileRoute, Outlet } from '@tanstack/react-router'
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarTrigger,
} from '@/components/ui/sidebar'
import { Suspense } from 'react'
import { NavigationEvents } from '@/components/utilities/navigation-events'
import { Gift, ShoppingBag, ListChecks, ListOrdered, ListPlus, Inbox, MessagesSquare, Plus } from 'lucide-react'
import NavBreadcrumbs from '@/components/sidebar/nav-breadcrumbs'
import Loading from '@/components/loading'
import NavSection, { type NavItem } from '@/components/sidebar/nav-section'
import NavBottom from '@/components/sidebar/nav-bottom'
import { NavUser } from '@/components/sidebar/nav-user'

export const Route = createFileRoute('/(core)')({
	component: CoreRouteComponent,
})
const main: NavItem[] = [
	{
		name: 'All Lists',
		url: '/',
		icon: ListChecks,
	},
	{
		name: 'My Lists',
		url: '/me',
		icon: ListOrdered,
	},
	{
		name: 'My Purchases',
		url: '/purchases',
		icon: ShoppingBag,
	},
]

const actions: NavItem[] = [
	{
		name: 'Quick Add Item',
		url: '/item/import',
		icon: Plus,
	},
	{
		name: 'Create New List',
		url: '/me?new=true',
		icon: ListPlus,
	},
]

const feeds: NavItem[] = [
	{
		name: 'Recent Comments',
		url: '/recent/comments',
		icon: MessagesSquare,
	},
	{
		name: 'Recent Items',
		url: '/recent/items',
		icon: Inbox,
	},
]

function CoreRouteComponent() {
	return (
		<>
			<SidebarProvider>
				{/* <AppSidebar /> */}
				<Sidebar variant="inset">
					<SidebarHeader>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton size="lg" asChild>
									<a href="/" className="">
										<div className="flex items-center justify-center rounded-lg aspect-square size-8 bg-destructive text-destructive-foreground hover:animate-spin">
											<Gift className="transition-colors" />
										</div>
										<span className="text-lg font-bold truncate">Wish Lists 2.0</span>
									</a>
								</SidebarMenuButton>
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarHeader>
					<SidebarContent>
						<NavSection title="Lists" items={main} />
						<NavSection title="Actions" items={actions} />
						<NavSection title="Feeds" items={feeds} />
						<NavBottom />
					</SidebarContent>
					<SidebarFooter>
						<Suspense fallback={null}>
							<NavUser />
						</Suspense>
					</SidebarFooter>
				</Sidebar>
				<SidebarInset>
					<header className="top-0 z-10 flex items-center h-12 gap-2 shrink-0">
						<div className="flex items-center gap-2 px-4">
							<SidebarTrigger className="-ml-1" />
							<Suspense fallback={null}>
								<NavBreadcrumbs />
							</Suspense>
						</div>
					</header>
					<div className="flex flex-col items-center flex-1 gap-4 p-4 pt-2">
						<Suspense fallback={<Loading />}>
							<Outlet />
						</Suspense>
					</div>
				</SidebarInset>
				{/* Handle navigation changes */}
				<Suspense fallback={null}>
					<NavigationEvents />
				</Suspense>
			</SidebarProvider>
			{/*  */}

			{/* <ToastContainer
			position="bottom-center"
			autoClose={2500}
			limit={2}
			hideProgressBar={false}
			newestOnTop
			closeOnClick
			pauseOnFocusLoss={false}
			draggable={false}
			pauseOnHover
			theme="dark"
			transition={Flip}
		/> */}
		</>
	)
	// <div>Hello "/(core)/"!</div>
}
