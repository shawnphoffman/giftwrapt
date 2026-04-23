import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Lock } from 'lucide-react'

import AdminLinks from '@/components/admin/links'
import { StorageDisabledBanner } from '@/components/common/storage-disabled-banner'
import { adminAuthMiddleware } from '@/middleware/auth'

export const Route = createFileRoute('/(core)/admin')({
	component: AdminRoutes,
	server: {
		middleware: [adminAuthMiddleware],
	},
})

function AdminRoutes() {
	return (
		<div className="wish-page max-w-4xl">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2 text-red-500">Admin</h1>
					<Lock className="text-red-500 wish-page-icon" />
				</div>
				<StorageDisabledBanner />
				{/* CONTENT */}
				<div className="mx-auto grid w-full max-w-8xl items-start gap-6 md:grid-cols-[180px_1fr] lg:grid-cols-[220px_1fr]">
					<nav className="grid gap-1">
						<AdminLinks />
					</nav>
					<div className="gap-6 flex flex-col @container/admin-content">
						<Outlet />
					</div>
				</div>
			</div>
		</div>
	)
}
