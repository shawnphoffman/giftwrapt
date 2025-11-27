import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(core)/lists/')({
	component: RouteComponent,
})

function RouteComponent() {
	return <div>Hello "/(core)/lists/"!</div>
}
