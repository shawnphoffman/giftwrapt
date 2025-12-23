import { createFileRoute, notFound, redirect } from '@tanstack/react-router'

import { getListForViewing } from '@/api/lists'
import ListTypeIcon from '@/components/common/list-type-icon'
import UserAvatar from '@/components/common/user-avatar'
import ItemList from '@/components/items/item-list'
// import UserAvatarBadge from '@/components/common/user-avatar-badge'
// import { Badge } from '@/components/ui/badge'
// import { ListTypes } from '@/db/schema/enums'

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
	// const listTypeLabel = ListTypes[list.type]

	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative flex items-center gap-3">
					<div className="flex flex-col gap-0.5 min-w-0">
						<div className="flex items-center min-w-0 gap-2">
							<UserAvatar name={recipientName} image={list.owner.image} />
							<h1 className="truncate">{list.name}</h1>
							{/* <Badge variant="outline" className="whitespace-nowrap">
								{listTypeLabel}
							</Badge> */}
							{/* <UserAvatarBadge name={recipientName} image={list.owner.image} /> */}
						</div>
					</div>
					<ListTypeIcon type={list.type} className="wish-page-icon" />
				</div>
				{/* ITEMS */}
				<ItemList items={list.items} />
			</div>
		</div>
	)
}
