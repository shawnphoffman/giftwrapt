import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(core)/lists/$listId')({
	component: ListDetailPage,
})

function ListDetailPage() {
	return <div>Hello "/(core)/lists/$listId"!</div>
}
