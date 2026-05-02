import { createFileRoute, Outlet } from '@tanstack/react-router'
import { FlaskConical } from 'lucide-react'

import TempLinks from '@/components/temp/links'
import { adminAuthMiddleware } from '@/middleware/auth'

export const Route = createFileRoute('/(core)/temp')({
	component: TempRoutes,
	server: {
		middleware: [adminAuthMiddleware],
	},
})

function TempRoutes() {
	return (
		<div className="wish-page max-w-7xl min-w-fit">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2 text-amber-500">Temp</h1>
					<FlaskConical className="text-amber-500 wish-page-icon" />
				</div>
				{/* CONTENT */}
				<div className="mx-auto grid w-full max-w-8xl items-start gap-6 md:grid-cols-[180px_1fr] lg:grid-cols-[165px_1fr]">
					<nav className="grid gap-1">
						<TempLinks />
					</nav>
					<div className="gap-6 flex flex-col @container/temp-content">
						<Outlet />
					</div>
				</div>
			</div>
		</div>
	)
}
