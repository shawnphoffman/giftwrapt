import { createFileRoute } from '@tanstack/react-router'

import { pageHead } from '@/routes/-head'

export const Route = createFileRoute('/(core)/item/clone')({
	head: pageHead('Copy Item'),
	component: RouteComponent,
})

function RouteComponent() {
	return <div>Hello "/(core)/item/clone"!</div>
}
