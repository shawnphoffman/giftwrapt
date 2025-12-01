import SettingsLinks from '@/components/settings/links'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Settings } from 'lucide-react'

export const Route = createFileRoute('/(core)/settings')({
	component: SettingsRoute,
})

function SettingsRoute() {
	return (
		<div className="flex flex-col flex-1 w-full max-w-5xl px-2 animate-page-in">
			<div className="relative flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<h1 className="flex flex-row items-center gap-2">Settings</h1>
				<Settings className="size-18 text-lime-500 opacity-30 absolute left-4 -top-4 -z-10" />
				<div className="mx-auto grid w-full max-w-6xl items-start gap-6 md:grid-cols-[180px_1fr] lg:grid-cols-[250px_1fr]">
					<nav className="grid gap-4 text-sm text-muted-foreground">
						<SettingsLinks />
					</nav>
					{/* <Suspense fallback={<FallbackRowThick />}>{children}</Suspense> */}
					<Outlet />
				</div>
			</div>
		</div>
	)
}
