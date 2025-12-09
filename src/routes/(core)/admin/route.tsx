import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Lock } from 'lucide-react'

import AdminLinks from '@/components/admin/links'
import { adminAuthMiddleware } from '@/middleware/auth'

export const Route = createFileRoute('/(core)/admin')({
	component: AdminRoutes,
	server: {
		middleware: [adminAuthMiddleware],
	},
})

function AdminRoutes() {
	return (
		<div className="flex flex-col flex-1 w-full max-w-3xl px-2 animate-page-in pb-2">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2 text-red-500">Admin</h1>
					<Lock className="size-22 -left-4 -top-6 text-red-500/30 absolute -z-10" />
				</div>
				{/* CONTENT */}
				<div className="mx-auto grid w-full max-w-6xl items-start gap-6 md:grid-cols-[150px_1fr] lg:grid-cols-[200px_1fr]">
					<nav className="grid gap-4 text-sm text-muted-foreground mt-6">
						<AdminLinks />
					</nav>
					<div className="gap-6 flex flex-col overflow-hidden">
						<Outlet />
					</div>
				</div>
			</div>
		</div>
	)
}
