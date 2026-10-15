import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Lock } from 'lucide-react'

import AdminLinks from '@/components/admin/links'
import { PageHeading } from '@/components/common/page-heading'
import { adminAuthMiddleware } from '@/middleware/auth'
import { pageHead } from '@/routes/-head'

export const Route = createFileRoute('/(core)/admin')({
	head: pageHead('Admin'),
	component: AdminRoutes,
	server: {
		middleware: [adminAuthMiddleware],
	},
})

function AdminRoutes() {
	return (
		<div className="wish-page max-w-7xl min-w-fit">
			<div className="@container/section flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<PageHeading title="Admin" icon={Lock} color="red" titleClassName="text-red-500" />
				{/* CONTENT */}
				<div className="mx-auto grid w-full max-w-8xl items-start gap-6 md:grid-cols-[11.25rem_1fr] lg:grid-cols-[10.3125rem_1fr] @max-[30rem]/section:grid-cols-1">
					<nav className="grid gap-1 md:sticky md:top-2 @max-[30rem]/section:static">
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
