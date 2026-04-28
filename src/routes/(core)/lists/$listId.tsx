import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { Suspense } from 'react'

import { getListForViewing } from '@/api/lists'
import ListTypeIcon from '@/components/common/list-type-icon'
import { MarkdownNotes } from '@/components/common/markdown-notes'
import UserAvatar from '@/components/common/user-avatar'
import ItemList from '@/components/items/item-list'
import { ItemListSkeleton } from '@/components/items/item-list-skeleton'
import { ListAddonsSection } from '@/components/list-addons/list-addons-section'
import { Skeleton } from '@/components/ui/skeleton'
import { listItemsViewQueryOptions } from '@/lib/queries/items'
import { useListSSE } from '@/lib/use-list-sse'
import { useScrollToHash } from '@/lib/use-scroll-to-hash'

export const Route = createFileRoute('/(core)/lists/$listId')({
	loader: async ({ params, context, location }) => {
		const listId = Number(params.listId)
		if (Number.isFinite(listId)) {
			// Kick off the items query without awaiting. Items stream in via
			// useSuspenseQuery + the <Suspense> boundary around <ItemList> so
			// the page header (name, owner, addons) renders immediately while
			// items load.
			void context.queryClient.prefetchQuery(listItemsViewQueryOptions(listId))
		}

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
				<ItemListSkeleton />
			</div>
		</div>
	)
}

function ListDetailPage() {
	const list = Route.useLoaderData()
	useListSSE(list.id)
	useScrollToHash([list.id])

	const recipientName = list.owner.name || list.owner.email

	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative flex items-center gap-3">
					<div className="flex flex-col gap-0.5 min-w-0">
						<div className="flex items-center min-w-0 gap-2">
							<UserAvatar name={recipientName} image={list.owner.image} />
							<h1 className="truncate">{list.name}</h1>
						</div>
					</div>
					<ListTypeIcon type={list.type} className="wish-page-icon" />
				</div>
				{list.description && <MarkdownNotes content={list.description} className="text-muted-foreground" />}
				{/* ITEMS */}
				<Suspense fallback={<ItemListSkeleton />}>
					<ItemList listId={list.id} groups={list.groups} />
				</Suspense>
				{/* OFF-LIST GIFTS */}
				<ListAddonsSection listId={list.id} addons={list.addons} />
			</div>
		</div>
	)
}
