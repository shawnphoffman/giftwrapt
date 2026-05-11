import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { Suspense } from 'react'

import { getListForViewing } from '@/api/lists'
import DependentAvatar from '@/components/common/dependent-avatar'
import ListTypeTile from '@/components/common/list-type-tile'
import { MarkdownNotes } from '@/components/common/markdown-notes'
import UserAvatar from '@/components/common/user-avatar'
import ItemList from '@/components/items/item-list'
import { ItemListSkeleton } from '@/components/items/item-list-skeleton'
import { ListAddonsSection } from '@/components/list-addons/list-addons-section'
import BackToParentList from '@/components/lists/back-to-parent-list'
import { TodoList } from '@/components/todos/todo-list'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '@/lib/auth-client'
import { listItemsViewQueryOptions } from '@/lib/queries/items'
import { useListSSE } from '@/lib/use-list-sse'
import { useScrollToHash } from '@/lib/use-scroll-to-hash'

type ListSearch = { from?: number; edit?: number }

export const Route = createFileRoute('/(core)/lists/$listId')({
	validateSearch: (search: Record<string, unknown>): ListSearch => {
		const out: ListSearch = {}
		const fromRaw = search.from
		const fromNum = typeof fromRaw === 'number' ? fromRaw : typeof fromRaw === 'string' ? Number(fromRaw) : NaN
		if (Number.isFinite(fromNum) && fromNum > 0) out.from = fromNum
		const editRaw = search.edit
		const editNum = typeof editRaw === 'number' ? editRaw : typeof editRaw === 'string' ? Number(editRaw) : NaN
		if (Number.isFinite(editNum) && editNum > 0) out.edit = editNum
		return out
	},
	loaderDeps: ({ search }) => ({ from: search.from, edit: search.edit }),
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
			const carry: { from?: number; edit?: number } = {}
			if (deps.from !== undefined) carry.from = deps.from
			if (deps.edit !== undefined) carry.edit = deps.edit
			throw redirect({
				to: '/lists/$listId/edit',
				params: { listId: result.listId },
				search: Object.keys(carry).length > 0 ? carry : undefined,
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
	const { data: session } = useSession()
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
				<div className="flex flex-col gap-1">
					<BackToParentList from={from} />
					<div className="flex items-center gap-1 xs:gap-3 min-w-0 group/list-title ">
						<div className="origin-center transition-transform duration-200 ease-out group-hover/list-title:scale-125 group-hover/list-title:-rotate-3">
							{list.subjectDependent ? (
								<DependentAvatar
									name={list.subjectDependent.name}
									image={list.subjectDependent.image}
									size="large"
									className=" border-2 border-background"
								/>
							) : (
								<UserAvatar name={recipientName} image={list.owner.image} size="large" className="border-2 border-background" />
							)}
						</div>
						<ListTypeTile type={list.type} />
						<h1 className="truncate">{list.name}</h1>
					</div>
				</div>
				{list.description && <MarkdownNotes content={list.description} className="text-muted-foreground" />}
				{list.type === 'todos' ? (
					// Todo lists have a totally different row shape (separate
					// todoItems table, single claim field, no gift fields) so
					// they render through their own component instead of the
					// gift-item path. canEdit is approximated by ownership;
					// fine-grained edit checks happen server-side per mutation.
					<TodoList listId={list.id} canEdit={!!session && session.user.id === list.owner.id} />
				) : (
					<>
						{/* ITEMS */}
						<Suspense fallback={<ItemListSkeleton />}>
							<ItemList listId={list.id} groups={list.groups} />
						</Suspense>
						{/* OFF-LIST GIFTS */}
						<ListAddonsSection listId={list.id} addons={list.addons} />
					</>
				)}
			</div>
		</div>
	)
}
