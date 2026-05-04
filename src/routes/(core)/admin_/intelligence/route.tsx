import { createFileRoute, Link, Outlet, useLocation } from '@tanstack/react-router'
import { BarChart3, CalendarClock, History, Mail, Settings as SettingsIcon, Sparkles, WandSparkles } from 'lucide-react'

import { PageHeading } from '@/components/common/page-heading'
import { adminIntelligenceQueryOptions } from '@/components/intelligence/use-admin-intelligence'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { adminAuthMiddleware } from '@/middleware/auth'

export const Route = createFileRoute('/(core)/admin_/intelligence')({
	loader: ({ context }) => context.queryClient.ensureQueryData(adminIntelligenceQueryOptions),
	component: AdminIntelligenceLayout,
	server: {
		middleware: [adminAuthMiddleware],
	},
})

const TABS: Array<{ to: string; label: string; icon: React.ElementType; exact?: boolean }> = [
	{ to: '/admin/intelligence', label: 'Stats', icon: BarChart3, exact: true },
	{ to: '/admin/intelligence/settings', label: 'Settings', icon: SettingsIcon },
	{ to: '/admin/intelligence/analyzers', label: 'Analyzers', icon: Sparkles },
	{ to: '/admin/intelligence/scheduling', label: 'Scheduling', icon: CalendarClock },
	{ to: '/admin/intelligence/notifications', label: 'Notifications', icon: Mail },
	{ to: '/admin/intelligence/history', label: 'History', icon: History },
]

function AdminIntelligenceLayout() {
	const { pathname } = useLocation()
	return (
		<div className="wish-page max-w-7xl">
			<div className="flex flex-col flex-1 gap-6">
				<PageHeading
					title="Intelligence"
					icon={WandSparkles}
					iconBgClassName="bg-gradient-to-br from-amber-500 via-pink-500 to-fuchsia-600 dark:from-amber-700 dark:via-pink-700 dark:to-fuchsia-800"
					iconRingClassName="ring-1 ring-fuchsia-400/40 dark:ring-fuchsia-600/40"
					titleClassName="bg-gradient-to-br from-amber-500 via-pink-500 to-fuchsia-600 bg-clip-text text-transparent dark:from-amber-400 dark:via-pink-400 dark:to-fuchsia-400"
				/>
				<div className="mx-auto grid w-full max-w-8xl items-start gap-6 md:grid-cols-[180px_1fr] lg:grid-cols-[180px_1fr]">
					<nav className="grid gap-1">
						{TABS.map(t => {
							const active = t.exact ? pathname === t.to : pathname === t.to || pathname.startsWith(`${t.to}/`)
							const Icon = t.icon
							return (
								<Link
									key={t.to}
									to={t.to}
									className={cn(
										buttonVariants({ variant: 'ghost' }),
										'justify-start w-full gap-2',
										active && 'bg-muted text-foreground hover:bg-muted'
									)}
								>
									<Icon className={cn('size-4', active && 'text-fuchsia-500')} />
									{t.label}
								</Link>
							)
						})}
					</nav>
					<div className="flex flex-col gap-6 animate-page-in min-w-0">
						<Outlet />
					</div>
				</div>
			</div>
		</div>
	)
}
