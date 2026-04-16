import { createFileRoute } from '@tanstack/react-router'

import { getListEditors } from '@/api/list-editors'
import { ListEditorsSection } from '@/components/list-editors/list-editors-section'

export const Route = createFileRoute('/(core)/lists_/$listId/edit')({
	loader: async ({ params }) => {
		const listId = Number(params.listId)
		if (!Number.isFinite(listId)) return { listId: 0, editors: [] }

		const editors = await getListEditors({ data: { listId } })

		return { listId, editors }
	},
	component: ListEditPage,
})

function ListEditPage() {
	const { listId, editors } = Route.useLoaderData()

	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				<h1>Edit list</h1>
				{/* Editors section */}
				<ListEditorsSection listId={listId} editors={editors} />
			</div>
		</div>
	)
}
