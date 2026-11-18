import { createFileRoute } from '@tanstack/react-router'

import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

export const Route = createFileRoute('/(core)/item/clone')({
	head: pageHead(() => m.page_copy_item()),
	component: RouteComponent,
})

function RouteComponent() {
	return <div>Hello "/(core)/item/clone"!</div>
}
