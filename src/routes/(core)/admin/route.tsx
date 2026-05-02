import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Lock } from 'lucide-react'

import { Admin2faBanner } from '@/components/admin/admin-2fa-banner'
import AdminLinks from '@/components/admin/links'
import { ClientOnly } from '@/components/utilities/client-only'
import { adminAuthMiddleware } from '@/middleware/auth'

export const Route = createFileRoute('/(core)/admin')({
	component: AdminRoutes,
	server: {
		middleware: [adminAuthMiddleware],
	},
})

function AdminRoutes() {
	return (
		<div className="wish-page max-w-7xl min-w-fit">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2 text-red-500">Admin</h1>
					<Lock className="text-red-500 wish-page-icon" />
				</div>
				{/* CONTENT */}
				<div className="mx-auto grid w-full max-w-8xl items-start gap-6 md:grid-cols-[180px_1fr] lg:grid-cols-[220px_1fr]">
					<nav className="grid gap-1">
						<AdminLinks />
					</nav>
					<div className="gap-6 flex flex-col @container/admin-content">
						<ClientOnly>
							<Admin2faBanner />
						</ClientOnly>
						<Outlet />
					</div>
				</div>
			</div>
		</div>
	)
}
