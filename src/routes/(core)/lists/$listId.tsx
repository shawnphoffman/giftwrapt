import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { Suspense } from 'react'

import { getListForViewing } from '@/api/lists'
import DependentAvatar from '@/components/common/dependent-avatar'
import ListTypeIcon from '@/components/common/list-type-icon'
import { MarkdownNotes } from '@/components/common/markdown-notes'
import UserAvatar from '@/components/common/user-avatar'
import ItemList from '@/components/items/item-list'
import { ItemListSkeleton } from '@/components/items/item-list-skeleton'
import { ListAddonsSection } from '@/components/list-addons/list-addons-section'
import BackToParentList from '@/components/lists/back-to-parent-list'
import { Skeleton } from '@/components/ui/skeleton'
import { listItemsViewQueryOptions } from '@/lib/queries/items'
import { useListSSE } from '@/lib/use-list-sse'
import { useScrollToHash } from '@/lib/use-scroll-to-hash'

type ListSearch = { from?: number }

export const Route = createFileRoute('/(core)/lists/$listId')({
	validateSearch: (search: Record<string, unknown>): ListSearch => {
		const raw = search.from
		const num = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
		return Number.isFinite(num) && num > 0 ? { from: num } : {}
	},
	loaderDeps: ({ search }) => ({ from: search.from }),
	loader: async ({ params, context, location, deps }) => {
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
				search: deps.from !== undefined ? { from: deps.from } : undefined,
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
	const { from } = Route.useSearch()
	useListSSE(list.id)
	useScrollToHash([list.id])

	// For dependent-subject lists the recipient is the dependent (pet,
	// baby, etc.), not the user who created the list. Swap to the
	// DependentAvatar (Sprout fallback) when the subject is set.
	const recipientName = list.subjectDependent ? list.subjectDependent.name : list.owner.name || list.owner.email

	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative flex flex-col gap-1">
					<BackToParentList from={from} />
					<div className="flex items-center gap-3">
						<div className="flex flex-col gap-0.5 min-w-0">
							<div className="flex items-center min-w-0 gap-2">
								{list.subjectDependent ? (
									<DependentAvatar
										name={list.subjectDependent.name}
										image={list.subjectDependent.image}
										className="size-12 border-2 border-background"
									/>
								) : (
									<UserAvatar name={recipientName} image={list.owner.image} className="size-12 border-2 border-background" />
								)}
								<h1 className="truncate">{list.name}</h1>
							</div>
						</div>
						<ListTypeIcon type={list.type} className="wish-page-icon" />
					</div>
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
