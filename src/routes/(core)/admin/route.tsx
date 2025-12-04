import { createFileRoute, Outlet } from '@tanstack/react-router'

import { adminAuthMiddleware } from '@/middleware/auth'

export const Route = createFileRoute('/(core)/admin')({
	component: AdminRoutes,
	server: {
		middleware: [adminAuthMiddleware],
	},
})

function AdminRoutes() {
	return <Outlet />
}
