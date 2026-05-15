import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { Gift, Inbox, ListChecks, ListOrdered, ListPlus, MessagesSquare, PackageOpen, Receipt, Sparkles, SquarePlus } from 'lucide-react'
import { Suspense, useMemo } from 'react'

import { getMyActiveRecommendationCount } from '@/api/intelligence'
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
import { EdgeSwipeListener } from '@/components/utilities/edge-swipe-listener'
import { ErrorBoundary } from '@/components/utilities/error-boundary'
import { NavigationEvents } from '@/components/utilities/navigation-events'
import { useAppSetting } from '@/hooks/use-app-settings'
import { auth } from '@/lib/auth'
import { useVersionCheck } from '@/lib/use-version-check'
import { authMiddleware } from '@/middleware/auth'

const checkSession = createServerFn({ method: 'GET' }).handler(async () => {
	const session = await auth.api.getSession({ headers: getRequestHeaders() })
	return session ? { authed: true as const } : { authed: false as const }
})

export const Route = createFileRoute('/(core)')({
	component: AuthenticatedRoutes,
	beforeLoad: async ({ location }) => {
		const r = await checkSession()
		if (!r.authed) {
			// Round-trip through sign-in: capture the original path+search+hash
			// so a /me?url=... or /import?url=... share-target survives the auth
			// detour. Skip when the user was just hitting /, since that's where
			// they'd land anyway. (The SSR path goes through authMiddleware,
			// which performs the same capture against the raw request URL.)
			const target = `${location.pathname}${location.searchStr}${location.hash ? `#${location.hash}` : ''}`
			throw redirect({
				to: '/sign-in',
				search: target && target !== '/' ? { redirect: target } : {},
			})
		}
	},
	server: {
		middleware: [authMiddleware],
	},
})
const suggestionsNav: NavItem = {
	name: 'Suggestions',
	url: '/suggestions',
	icon: Sparkles,
	hoverColor: 'group-hover/link:text-fuchsia-500 group-data-[status=active]/link:text-fuchsia-500 animate-throb',
}

const mainBase: Array<NavItem> = [
	{
		name: 'All Lists',
		url: '/',
		icon: ListChecks,
		hoverColor: 'group-hover/link:text-green-500 group-data-[status=active]/link:text-green-500',
		activeMatch: p => p.startsWith('/lists/') && !p.endsWith('/edit') && !p.endsWith('/bulk') && !p.endsWith('/organize'),
	},
	{
		name: 'My Lists',
		url: '/me',
		icon: ListOrdered,
		hoverColor: 'group-hover/link:text-red-500 group-data-[status=active]/link:text-red-500',
		activeMatch: p => p.startsWith('/lists/') && (p.endsWith('/edit') || p.endsWith('/bulk') || p.endsWith('/organize')),
	},
]

const purchases: Array<NavItem> = [
	{
		name: 'Purchases',
		url: '/purchases',
		hoverColor: 'group-hover/link:text-pink-500 group-data-[status=active]/link:text-pink-500',
		icon: Receipt,
		activeOptions: {
			exact: true,
		},
	},
	{
		name: 'Received',
		url: '/purchases/received',
		hoverColor: 'group-hover/link:text-cyan-500 group-data-[status=active]/link:text-cyan-500',
		icon: PackageOpen,
	},
]

const actions: Array<NavItem> = [
	{
		name: 'Add Item',
		url: '/me#add-item',
		mask: '/me',
		icon: SquarePlus,
		hoverColor: 'group-hover/link:text-blue-500 group-data-[status=active]/link:text-blue-500',
		activeOptions: {
			exact: true,
		},
	},
	{
		name: 'Create List',
		url: '/me#new',
		mask: '/me',
		icon: ListPlus,
		hoverColor: 'group-hover/link:text-yellow-500 group-data-[status=active]/link:text-yellow-500',
		activeOptions: {
			exact: true,
		},
	},
]

const feeds: Array<NavItem> = [
	{
		name: 'Items',
		url: '/recent/items',
		icon: Inbox,
		hoverColor: 'group-hover/link:text-purple-500 group-data-[status=active]/link:text-purple-500',
	},
	{
		name: 'Comments',
		url: '/recent/comments',
		icon: MessagesSquare,
		hoverColor: 'group-hover/link:text-teal-500 group-data-[status=active]/link:text-teal-500',
	},
]

function AuthenticatedRoutes() {
	const appTitle = useAppSetting('appTitle')
	useVersionCheck()
	// Hide Suggestions in the sidebar when the user has no active recs (or
	// the feature is off). Cheap COUNT query, refetched on the same cadence
	// as the suggestions page so the link reappears once a new batch lands.
	const { data: recCount } = useQuery({
		queryKey: ['intelligence', 'me', 'active-count'] as const,
		queryFn: () => getMyActiveRecommendationCount(),
		staleTime: 30_000,
	})
	const main = useMemo(() => (recCount && recCount.count > 0 ? [suggestionsNav, ...mainBase] : mainBase), [recCount])
	return (
		<SidebarProvider>
			<Sidebar variant="inset" collapsible="icon">
				<SidebarHeader>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton size="lg" asChild tooltip={appTitle}>
								<Link to="/" className="">
									<div className="flex items-center justify-center rounded-lg aspect-square size-8 bg-red-700 text-white hover:animate-spin">
										<Gift className="transition-colors size-6!" />
									</div>
									<span className="text-lg font-bold truncate">{appTitle}</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarHeader>
				<SidebarContent>
					<NavSection title="Lists" items={main} />
					<NavSection title="Actions" items={actions} />
					<NavSection title="Purchases" items={purchases} />
					<NavSection title="Recent" items={feeds} />
					<NavBottom />
				</SidebarContent>
				<SidebarFooter>
					<Suspense fallback={<Skeleton className="h-8 w-full" />}>
						<NavUser />
					</Suspense>
				</SidebarFooter>
			</Sidebar>
			<SidebarInset>
				{/* <header className="sticky top-0 z-10 flex items-center justify-between h-12 gap-2 shrink-0 w-full"> */}
				{/* `pt-[env(...)]` only adds height in iOS PWA standalone mode where
				    `apple-mobile-web-app-status-bar-style: black-translucent` lets
				    content render under the status bar; in regular Safari/desktop
				    the inset is 0 so this is a no-op. */}
				<header className=" top-0 z-10 flex items-center justify-between h-12 gap-2 shrink-0 w-full pt-[env(safe-area-inset-top)] box-content">
					<div className="flex items-center gap-2 w-fit rounded-lg px-4">
						<SidebarTrigger className=" -ml-1 [&_svg]:size-6! bg-background/75" />
						<div className="bg-background/75 rounded-lg px-2">
							<NavBreadcrumbs />
						</div>
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
											Try Again
										</button>
										<Link
											to="/"
											onClick={reset}
											className="px-4 py-2 text-sm font-medium border border-input bg-background rounded-md hover:bg-accent transition-colors"
										>
											Go Home
										</Link>
									</div>
								</div>
							</div>
						)}
					>
						<Suspense
							fallback={
								<div className="flex items-center justify-center flex-1 w-full">
									<Loading />
								</div>
							}
						>
							<Outlet />
						</Suspense>
					</ErrorBoundary>
				</div>
			</SidebarInset>
			{/* Handle navigation changes */}
			<Suspense fallback={null}>
				<NavigationEvents />
			</Suspense>
			<EdgeSwipeListener />
		</SidebarProvider>
	)
}
