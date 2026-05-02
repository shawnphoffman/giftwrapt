import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Settings } from 'lucide-react'

import SettingsLinks from '@/components/settings/links'
import { Card } from '@/components/ui/card'

export const Route = createFileRoute('/(core)/settings')({
	component: SettingsRoute,
})

function SettingsRoute() {
	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Settings</h1>
					<Settings className="text-lime-500 wish-page-icon" />
				</div>
				{/* CONTENT */}
				<div className="mx-auto grid w-full max-w-6xl items-start gap-6 md:grid-cols-[180px_1fr] lg:grid-cols-[165px_1fr]">
					<nav className="grid gap-1">
						<SettingsLinks />
					</nav>
					<div className="grid gap-6 animate-page-in">
						<Card className="@container/subpage">
							<Outlet />
						</Card>
					</div>
				</div>
			</div>
		</div>
	)
}
