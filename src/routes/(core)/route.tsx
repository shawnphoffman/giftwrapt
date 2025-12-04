import {
	createFileRoute,
	Link,
	Outlet,
	// , redirect
} from '@tanstack/react-router'
import { FlaskConical, Gift, Inbox, ListChecks, ListOrdered, ListPlus, MessagesSquare, Plus, Receipt } from 'lucide-react'
import { Suspense } from 'react'

import Loading from '@/components/loading'
import NavBottom from '@/components/sidebar/nav-bottom'
import NavBreadcrumbs from '@/components/sidebar/nav-breadcrumbs'
import type { NavItem } from '@/components/sidebar/nav-section'
import NavSection from '@/components/sidebar/nav-section'
import { NavUser } from '@/components/sidebar/nav-user'
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
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorBoundary } from '@/components/utilities/error-boundary'
import { NavigationEvents } from '@/components/utilities/navigation-events'
// import { useSession } from '@/lib/auth-client'
import { authMiddleware } from '@/middleware/auth'

export const Route = createFileRoute('/(core)')({
	component: AuthenticatedRoutes,
	server: {
		middleware: [authMiddleware],
	},
})
const main: Array<NavItem> = [
	{
		name: 'All Lists',
		url: '/lists',
		icon: ListChecks,
		hoverColor: 'group-hover/link:text-green-500',
	},
	{
		name: 'My Lists',
		url: '/me',
		icon: ListOrdered,
		hoverColor: 'group-hover/link:text-red-500',
	},
	{
		name: 'My Purchases',
		url: '/purchases',
		hoverColor: 'group-hover/link:text-pink-500',
		icon: Receipt,
	},
]

const actions: Array<NavItem> = [
	{
		name: 'Quick Add Item',
		url: '/item/import',
		icon: Plus,
		hoverColor: 'group-hover/link:text-blue-500',
	},
	{
		name: 'Create New List',
		url: '/me/new',
		mask: '/me',
		icon: ListPlus,
		hoverColor: 'group-hover/link:text-yellow-500',
	},
]

const feeds: Array<NavItem> = [
	{
		name: 'Recent Comments',
		url: '/recent/comments',
		icon: MessagesSquare,
		hoverColor: 'group-hover/link:text-teal-500',
	},
	{
		name: 'Recent Items',
		url: '/recent/items',
		icon: Inbox,
		hoverColor: 'group-hover/link:text-purple-500',
	},
	{
		name: 'Test Styles',
		url: '/test/styles',
		icon: FlaskConical,
		hoverColor: 'group-hover/link:text-blue-500',
	},
]

function AuthenticatedRoutes() {
	return (
		<SidebarProvider>
			<Sidebar variant="inset">
				<SidebarHeader>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton size="lg" asChild>
								<Link to="/" className="">
									<div className="flex items-center justify-center rounded-lg aspect-square size-8 bg-destructive text-destructive-foreground hover:animate-spin">
										<Gift className="transition-colors" />
									</div>
									<span className="text-lg font-bold truncate">Wish Lists 2.0</span>
								</Link>
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
					<Suspense fallback={<Skeleton className="h-8 w-full" />}>
						<NavUser />
					</Suspense>
				</SidebarFooter>
			</Sidebar>
			<SidebarInset>
				<header className="top-0 z-10 flex items-center h-12 gap-2 shrink-0">
					<div className="flex items-center gap-2 px-4">
						<SidebarTrigger className="-ml-1 [&_svg]:size-6!" />
						<NavBreadcrumbs />
					</div>
				</header>
				<div className="flex flex-col items-center flex-1 gap-4 px-0 py-2 sm:px-2">
					<ErrorBoundary
						fallback={(error, reset) => (
							<div className="flex flex-col items-center justify-center min-h-[400px] p-4 w-full">
								<div className="max-w-md space-y-4 text-center">
									<h2 className="text-lg font-semibold text-destructive">Page Error</h2>
									<p className="text-sm text-muted-foreground">{error.message || 'Something went wrong while loading this page.'}</p>
									<div className="flex gap-2 justify-center">
										<button
											onClick={reset}
											className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors"
										>
											Try again
										</button>
										<Link
											to="/"
											className="px-4 py-2 text-sm font-medium border border-input bg-background rounded-md hover:bg-accent transition-colors"
										>
											Go home
										</Link>
									</div>
								</div>
							</div>
						)}
					>
						<Suspense fallback={<Loading />}>
							<Outlet />
						</Suspense>
					</ErrorBoundary>
				</div>
			</SidebarInset>
			{/* Handle navigation changes */}
			<Suspense fallback={null}>
				<NavigationEvents />
			</Suspense>
		</SidebarProvider>
	)
}
