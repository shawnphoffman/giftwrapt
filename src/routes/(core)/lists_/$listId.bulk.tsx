import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(core)/lists_/$listId/bulk')({
	component: RouteComponent,
})

function RouteComponent() {
	const { listId } = Route.useParams()
	return (
		<div>
			<h1>Hello "/(core)/lists_/$listId/bulk!</h1>
			<p>This is the bulk edit page for the list with ID {listId}.</p>
		</div>
	)
}
