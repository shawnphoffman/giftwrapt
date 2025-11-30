import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(core)/lists_/$listId/edit')({
	component: RouteComponent,
})

function RouteComponent() {
	const { listId } = Route.useParams()
	return (
		<div>
			<h1>Hello "/(core)/lists_/$listId"!</h1>
			<p>This is the edit page for the list with ID {listId}.</p>
		</div>
	)
}
