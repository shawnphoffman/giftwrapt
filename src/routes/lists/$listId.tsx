import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/lists/$listId')({
	component: ListDetailPage,
})

function ListDetailPage() {
	const { listId } = Route.useParams()
	return (
		<div>
			<h1>Hello "/(core)/lists_/$listId"!</h1>
			<p>This is the view page for the list with ID {listId}.</p>
		</div>
	)
}
