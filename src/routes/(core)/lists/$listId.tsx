import { createFileRoute, notFound, redirect } from '@tanstack/react-router'

import { getListForViewing } from '@/api/lists'
import UserAvatar from '@/components/common/user-avatar'
import { Badge } from '@/components/ui/badge'
import { ListTypes } from '@/db/schema/enums'

export const Route = createFileRoute('/(core)/lists/$listId')({
	loader: async ({ params }) => {
		const result = await getListForViewing({ data: { listId: params.listId } })

		if (!result) {
			throw notFound()
		}

		if (result.kind === 'redirect') {
			throw redirect({
				to: '/lists/$listId/edit',
				params: { listId: result.listId },
			})
		}

		return result.list
	},
	component: ListDetailPage,
})

function ListDetailPage() {
	const list = Route.useLoaderData()

	const recipientName = list.owner.name || list.owner.email
	const listTypeLabel = ListTypes[list.type]

	return (
		<div className="flex flex-col flex-1 w-full max-w-3xl px-2 animate-page-in">
			<div className="flex items-center gap-3">
				<UserAvatar name={recipientName} image={list.owner.image} size="large" />
				<div className="flex flex-col gap-0.5 min-w-0">
					<div className="flex items-center gap-2 min-w-0">
						<h1 className="truncate">{list.name}</h1>
						<Badge variant="outline" className="whitespace-nowrap">
							{listTypeLabel}
						</Badge>
					</div>
					<div className="text-sm text-muted-foreground truncate">{recipientName}</div>
				</div>
			</div>
		</div>
	)
}
