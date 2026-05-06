import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Settings } from 'lucide-react'

import { PageHeading } from '@/components/common/page-heading'
import SettingsLinks from '@/components/settings/links'

export const Route = createFileRoute('/(core)/settings')({
	component: SettingsRoute,
})

function SettingsRoute() {
	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<PageHeading title="Settings" icon={Settings} color="lime" />
				{/* CONTENT */}
				<div className="mx-auto grid w-full max-w-6xl items-start gap-6 md:grid-cols-[180px_1fr] lg:grid-cols-[165px_1fr]">
					<nav className="grid gap-1">
						<SettingsLinks />
					</nav>
					{/* @container/subpage: child pages run container queries against
					    this shell (e.g. profile-form's @md/subpage:grid-cols-2). */}
					<div className="@container/subpage grid gap-6">
						<Outlet />
					</div>
				</div>
			</div>
		</div>
	)
}
