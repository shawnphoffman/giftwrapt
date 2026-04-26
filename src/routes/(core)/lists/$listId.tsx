import { createFileRoute, notFound, redirect } from '@tanstack/react-router'

import { getListForViewing } from '@/api/lists'
import ListTypeIcon from '@/components/common/list-type-icon'
import { MarkdownNotes } from '@/components/common/markdown-notes'
import UserAvatar from '@/components/common/user-avatar'
import ItemList from '@/components/items/item-list'
import { ListAddonsSection } from '@/components/list-addons/list-addons-section'
import { Skeleton } from '@/components/ui/skeleton'
import { useListSSE } from '@/lib/use-list-sse'
import { useScrollToHash } from '@/lib/use-scroll-to-hash'
// import UserAvatarBadge from '@/components/common/user-avatar-badge'
// import { Badge } from '@/components/ui/badge'
// import { ListTypes } from '@/db/schema/enums'

export const Route = createFileRoute('/(core)/lists/$listId')({
	loader: async ({ params, location }) => {
		// Not SWR-cached: this page has heavy mutation surface (items, gifts,
		// comments, addons) plus an SSE channel calling router.invalidate(),
		// and ensureQueryData would short-circuit those refetches inside the
		// staleTime window. The pending shell + parallelized fetches handle
		// perceived speed here instead.
		const result = await getListForViewing({ data: { listId: params.listId } })

		if (!result) {
			throw notFound()
		}

		if (result.kind === 'redirect') {
			throw redirect({
				to: '/lists/$listId/edit',
				params: { listId: result.listId },
				hash: location.hash || undefined,
			})
		}

		return result.list
	},
	component: ListDetailPage,
	pendingComponent: ListDetailPagePending,
})

function ListDetailPagePending() {
	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				<div className="relative flex items-center gap-3">
					<div className="flex flex-col gap-0.5 min-w-0 flex-1">
						<div className="flex items-center min-w-0 gap-2">
							<Skeleton className="size-8 rounded-full shrink-0" />
							<Skeleton className="h-7 w-2/3 max-w-sm" />
						</div>
					</div>
					<Skeleton className="size-8 rounded" />
				</div>
				<div className="flex flex-col gap-2 pl-6">
					{Array.from({ length: 4 }).map((_, i) => (
						<Skeleton key={i} className="h-12 w-full" />
					))}
				</div>
			</div>
		</div>
	)
}

function ListDetailPage() {
	const list = Route.useLoaderData()
	useListSSE(list.id)
	useScrollToHash([list.id])

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
				{list.description && <MarkdownNotes content={list.description} className="text-muted-foreground" />}
				{/* ITEMS */}
				<ItemList items={list.items} groups={list.groups} />
				{/* OFF-LIST GIFTS */}
				<ListAddonsSection listId={list.id} addons={list.addons} />
			</div>
		</div>
	)
}
