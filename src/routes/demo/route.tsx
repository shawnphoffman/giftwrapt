import Header from '@/components/Header'
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/demo')({
	component: DemoRouteComponent,
})

function DemoRouteComponent() {
	return (
		<div>
			<Header />
			<Outlet />
		</div>
	)
}
