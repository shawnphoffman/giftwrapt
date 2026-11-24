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
import { RouteErrorFallback } from '@/components/utilities/route-error-fallback'
import { useAppSetting } from '@/hooks/use-app-settings'
import { useEmbedded } from '@/hooks/use-embedded'
import { auth } from '@/lib/auth'
import { postToNativeBridge } from '@/lib/embedded'
import { myGiftExchangeCountQueryOptions } from '@/lib/queries/gift-exchanges'
import { useVersionCheck } from '@/lib/use-version-check'
import { cn } from '@/lib/utils'
import { authMiddleware } from '@/middleware/auth'
import { m } from '@/paraglide/messages.js'

const checkSession = createServerFn({ method: 'GET' }).handler(async () => {
	const session = await auth.api.getSession({ headers: getRequestHeaders() })
	if (!session) return { authed: false as const }
	// Just what the sidebar footer shows, so SSR renders the signed-in user
	// instead of a skeleton (useSession never has data on the server).
	const { name, email, image } = session.user
	return { authed: true as const, user: { name, email, image: image ?? null } }
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
		return { sessionUser: r.user }
	},
	server: {
		middleware: [authMiddleware],
	},
})
const suggestionsNav: NavItem = {
	name: () => m.nav_suggestions(),
	url: '/suggestions',
	icon: Sparkles,
	hoverColor: 'group-hover/link:text-fuchsia-500 group-data-[status=active]/link:text-fuchsia-500 animate-throb',
	className:
		'bg-gradient-to-r from-amber-500/10 via-pink-500/10 to-fuchsia-500/10 hover:from-amber-500/20 hover:via-pink-500/20 hover:to-fuchsia-500/20 text-fuchsia-600 dark:text-fuchsia-300 hover:text-fuchsia-600 dark:hover:text-fuchsia-300',
}

const mainBase: Array<NavItem> = [
	{
		name: () => m.nav_all_lists(),
		url: '/',
		icon: ListChecks,
		hoverColor: 'group-hover/link:text-green-500 group-data-[status=active]/link:text-green-500',
		activeMatch: p => p.startsWith('/lists/') && !p.endsWith('/edit') && !p.endsWith('/bulk') && !p.endsWith('/organize'),
	},
	{
		name: () => m.nav_my_lists(),
		url: '/me',
		icon: ListOrdered,
		hoverColor: 'group-hover/link:text-red-500 group-data-[status=active]/link:text-red-500',
		activeMatch: p => p.startsWith('/lists/') && (p.endsWith('/edit') || p.endsWith('/bulk') || p.endsWith('/organize')),
	},
]

// The last item of the Lists section, shown only while the Gift Exchange page
// has something on it (an exchange the user is in, or a child's).
const giftExchangeNav: NavItem = {
	name: () => m.nav_gift_exchange(),
	url: '/gift-exchange',
	icon: Gift,
	hoverColor: 'group-hover/link:text-red-500 group-data-[status=active]/link:text-red-500',
}

const purchases: Array<NavItem> = [
	{
		name: () => m.nav_purchases(),
		url: '/purchases',
		hoverColor: 'group-hover/link:text-pink-500 group-data-[status=active]/link:text-pink-500',
		icon: Receipt,
		activeOptions: {
			exact: true,
		},
	},
	{
		name: () => m.nav_received(),
		url: '/purchases/received',
		hoverColor: 'group-hover/link:text-cyan-500 group-data-[status=active]/link:text-cyan-500',
		icon: PackageOpen,
	},
]

const addItemAction: NavItem = {
	name: () => m.nav_add_item(),
	url: '/me#add-item',
	mask: '/me',
	icon: SquarePlus,
	hoverColor: 'group-hover/link:text-blue-500 group-data-[status=active]/link:text-blue-500',
	activeOptions: {
		exact: true,
	},
}

// Inside the iOS web tab the sidebar's Add Item hands off to the native
// Save flow (camera, barcode, share-sheet paste) over the bridge. The web
// dialog stays reachable from the list page itself, so nothing is lost.
const addItemActionEmbedded: NavItem = {
	...addItemAction,
	onClick: event => {
		if (postToNativeBridge({ type: 'save' })) event.preventDefault()
	},
}

const actions: Array<NavItem> = [
	addItemAction,
	{
		name: () => m.nav_create_list(),
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
		name: () => m.nav_recent_items(),
		url: '/recent/items',
		icon: Inbox,
		hoverColor: 'group-hover/link:text-purple-500 group-data-[status=active]/link:text-purple-500',
	},
	{
		name: () => m.nav_recent_comments(),
		url: '/recent/comments',
		icon: MessagesSquare,
		hoverColor: 'group-hover/link:text-teal-500 group-data-[status=active]/link:text-teal-500',
	},
]

function AuthenticatedRoutes() {
	const appTitle = useAppSetting('appTitle')
	const { sessionUser } = Route.useRouteContext()
	useVersionCheck()
	// Hide Suggestions in the sidebar when the user has no active recs (or
	// the feature is off). Cheap COUNT query, refetched on the same cadence
	// as the suggestions page so the link reappears once a new batch lands.
	const { data: recCount } = useQuery({
		queryKey: ['intelligence', 'me', 'active-count'] as const,
		queryFn: () => getMyActiveRecommendationCount(),
		staleTime: 30_000,
	})
	// Same for Gift Exchange: a COUNT of the drawn, unarchived exchanges the
	// user (or a child of theirs) is in. A reveal invalidates it.
	const { data: exchangeCount } = useQuery(myGiftExchangeCountQueryOptions())
	const main = useMemo(() => {
		const withSuggestions = recCount && recCount.count > 0 ? [suggestionsNav, ...mainBase] : mainBase
		return exchangeCount && exchangeCount.count > 0 ? [...withSuggestions, giftExchangeNav] : withSuggestions
	}, [recCount, exchangeCount])
	// Embedded shell (iOS web tab, plan 28): Add Item goes native and the
	// page gets bottom safe-area padding so the home indicator never covers
	// content. The head already sets `viewport-fit=cover`.
	const embedded = useEmbedded()
	const actionItems = useMemo(() => (embedded ? [addItemActionEmbedded, ...actions.slice(1)] : actions), [embedded])
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
					<NavSection title={m.nav_section_lists()} items={main} />
					<NavSection title={m.nav_section_actions()} items={actionItems} />
					<NavSection title={m.nav_section_purchases()} items={purchases} />
					<NavSection title={m.nav_section_recent()} items={feeds} />
					<NavBottom />
				</SidebarContent>
				<SidebarFooter>
					<Suspense fallback={<Skeleton className="h-8 w-full" />}>
						<NavUser initialUser={sessionUser} />
					</Suspense>
				</SidebarFooter>
			</Sidebar>
			<SidebarInset>
				{/* Sticky so the sidebar toggle stays reachable on a scrolled page:
				    below the `md` breakpoint (phones, an iPad mini PWA, the iOS web
				    tab) it is the only way to open the navigation. The bar itself is
				    transparent and ignores taps; only the toggle and breadcrumb
				    pills (which carry their own background) take them, so content
				    scrolling underneath stays clickable. z-30 keeps it above page
				    content that sets its own z-index (the organize rows and toolbar).

				    The safe-area-inset-top padding only adds height in iOS PWA
				    standalone mode, where `apple-mobile-web-app-status-bar-style:
				    black-translucent` lets content render under the status bar; in
				    regular Safari/desktop the inset is 0 so it is a no-op. The
				    `before` strip paints that inset with the page background so
				    scrolled content never shows through behind the clock.
				    NOTE: keep this comment free of any literal `pt-env(...)`
				    pseudo-class string — Tailwind's content scanner extracts class
				    names from comments too, and an ellipsis inside the bracket
				    generates an invalid CSS rule that LightningCSS warns on. */}
				<header className="pointer-events-none sticky top-0 z-30 flex items-center justify-between h-12 gap-2 shrink-0 w-full pt-[env(safe-area-inset-top)] box-content before:absolute before:inset-x-0 before:top-0 before:h-[env(safe-area-inset-top)] before:bg-background">
					<div className="pointer-events-auto flex items-center gap-2 w-fit rounded-lg px-4">
						<SidebarTrigger className=" -ml-1 [&_svg]:size-6! bg-background/75" />
						<div className="bg-background/75 rounded-lg px-2">
							<NavBreadcrumbs />
						</div>
					</div>
				</header>
				<div className={cn('flex flex-col items-center flex-1 gap-4 px-0 py-2 sm:px-2', embedded && 'pb-[env(safe-area-inset-bottom)]')}>
					<ErrorBoundary fallback={(error, reset) => <RouteErrorFallback error={error} reset={reset} />}>
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
