import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { Suspense } from 'react'
import { Skeleton, SkeletonSuspense } from 'skullet/react'

import { getListAccess, type ListHeader } from '@/api/lists'
import DependentAvatar from '@/components/common/dependent-avatar'
import ListTypeTile from '@/components/common/list-type-tile'
import { MarkdownNotes } from '@/components/common/markdown-notes'
import UserAvatar from '@/components/common/user-avatar'
import { GiftHelpButton } from '@/components/gift-help/gift-help-dialog'
import { GiftIdeasOnList } from '@/components/gift-ideas/gift-ideas-section'
import ItemList, { ItemListView } from '@/components/items/item-list'
import { ListAddonsSection } from '@/components/list-addons/list-addons-section'
import { ListAddonsSectionSkeleton } from '@/components/list-addons/list-addons-section-skeleton'
import { ArchiveRevealBadge } from '@/components/lists/archive-reveal-badge'
import BackToParentList from '@/components/lists/back-to-parent-list'
import { SAMPLE_ITEMS, SAMPLE_LIST_HEADING } from '@/components/lists/list-detail-sample'
import { ListOrphanAlert } from '@/components/orphan-claims/list-orphan-alert'
import { PendingPage } from '@/components/skeletons/pending-page'
import { TodoList } from '@/components/todos/todo-list'
import { RouteErrorFallback } from '@/components/utilities/route-error-fallback'
import { perfTime } from '@/lib/observability/perf'
import { listHeaderQueryOptions } from '@/lib/queries/lists' // used by useSuspenseQuery below
import { useListAutoRefresh } from '@/lib/use-list-auto-refresh'
import { useListSSE } from '@/lib/use-list-sse'
import { useScrollToHash } from '@/lib/use-scroll-to-hash'
import { pageHead } from '@/routes/-head'

type ListSearch = { from?: number; edit?: number }

export const Route = createFileRoute('/(core)/lists/$listId')({
	errorComponent: ({ error, reset }) => <RouteErrorFallback error={error} reset={reset} title="This list couldn't load" />,
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
	loader: async ({ params, location, deps }) => {
		// Empty-loader pattern: only what's needed to ROUTE.
		// - Resolve the owner-redirect short-circuit before render so an
		//   owner navigating to their own non-dependent list bounces to
		//   the edit view without a flash of gifter content.
		// - 404 cases (missing list / no view permission) get caught here too.
		// Heavy header + addons fetches stream client-side via Suspense.
		//
		// We intentionally do NOT prefetch listHeader / listAddons here.
		// setupRouterSsrQueryIntegration treats any query touched by the
		// loader as part of the route's loading state, which would defeat
		// the instant-swap goal. Let the component mount, suspend in its
		// own boundary, and fire the queries from useSuspenseQuery.
		const access = await perfTime('loader:lists/$listId getListAccess', () => getListAccess({ data: { listId: params.listId } }))

		if (!access) throw notFound()

		if (access.kind === 'redirect') {
			const carry: { from?: number; edit?: number } = {}
			if (deps.from !== undefined) carry.from = deps.from
			if (deps.edit !== undefined) carry.edit = deps.edit
			throw redirect({
				to: '/lists/$listId/edit',
				params: { listId: access.listId },
				search: Object.keys(carry).length > 0 ? carry : undefined,
				hash: location.hash || undefined,
			})
		}

		return { listId: access.listId, listName: access.name }
	},
	head: pageHead<{ listName: string }>(d => d?.listName ?? 'List'),
	// Shown instead of the app-wide spinner while the loader resolves
	// access, so a slow loader and the header fetch after it read as one
	// skeleton rather than a spinner followed by a skeleton.
	pendingComponent: ListDetailPending,
	component: ListDetailPage,
})

function ListDetailPending() {
	return (
		<PendingPage>
			<Skeleton loading label="Loading list">
				<ListDetailSkeleton />
			</Skeleton>
		</PendingPage>
	)
}

function ListDetailPage() {
	const { listId } = Route.useLoaderData()
	const { from } = Route.useSearch()
	useListSSE(listId)
	useListAutoRefresh(listId)
	useScrollToHash([listId])

	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				<BackToParentList from={from} />
				<SkeletonSuspense id={`list-detail-${listId}`} label="Loading list" skeleton={<ListDetailSkeleton />}>
					<ListDetailBody listId={listId} />
				</SkeletonSuspense>
			</div>
		</div>
	)
}

// Measured by skullet from the real components rendered with sample data,
// so the skeleton has the page's own layout. The id remembers the last real
// shape per list, so a repeat visit draws that instead.
function ListDetailSkeleton() {
	return (
		<div className="flex flex-col gap-6">
			<ListHeading list={SAMPLE_LIST_HEADING} />
			<ItemListView items={SAMPLE_ITEMS} />
		</div>
	)
}

function recipientNameOf(list: Pick<ListHeader, 'owner' | 'subjectDependent'>): string {
	return list.subjectDependent ? list.subjectDependent.name : list.owner.name || list.owner.email
}

function ListHeading({ list }: { list: Pick<ListHeader, 'name' | 'type' | 'owner' | 'subjectDependent'> }) {
	// For dependent-subject lists the recipient is the dependent (pet,
	// baby, etc.), not the user who created the list. Swap to the
	// DependentAvatar (Sprout fallback) when the subject is set.
	const recipientName = recipientNameOf(list)
	return (
		<div className="flex flex-col gap-1">
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
	)
}

function ListDetailBody({ listId }: { listId: number }) {
	const { data: list } = useSuspenseQuery(listHeaderQueryOptions(listId))

	const recipientName = recipientNameOf(list)

	// Its own gap-6 column: skullet wraps this body in block-level elements,
	// so it can't lean on the page column's gap.
	return (
		<div className="flex flex-col gap-6">
			<ListHeading list={list} />
			{list.description && <MarkdownNotes content={list.description} className="text-muted-foreground" />}
			{list.type !== 'todos' && <ListOrphanAlert listId={list.id} />}
			{list.type === 'todos' ? (
				// Todo lists have a totally different row shape (separate
				// todoItems table, single claim field, no gift fields) so
				// they render through their own component instead of the
				// gift-item path. `canEdit` comes from the server-side
				// canEditList check baked into the header payload, so an
				// editor on someone else's list also gets the Add ToDo
				// affordance.
				<TodoList listId={list.id} canEdit={list.canEdit} />
			) : (
				<>
					{/* ITEMS */}
					<SkeletonSuspense id={`list-items-${list.id}`} label="Loading items" skeleton={<ItemListView items={SAMPLE_ITEMS} />}>
						<ItemList
							listId={list.id}
							groups={list.groups}
							filterBarLeading={
								<>
									<ArchiveRevealBadge archiveInfo={list.archiveInfo} recipientName={recipientName} />
									{/* NEED IDEAS? (renders nothing unless the admin turned gift suggestions on) */}
									<Suspense fallback={null}>
										<GiftHelpButton listId={list.id} recipientName={recipientName} />
									</Suspense>
								</>
							}
						/>
					</SkeletonSuspense>
					{/* GIFT IDEAS: the viewer's ideas for this recipient (renders nothing without any) */}
					<Suspense fallback={null}>
						<GiftIdeasOnList listId={list.id} recipientName={recipientName} />
					</Suspense>
					{/* OFF-LIST GIFTS */}
					<Suspense fallback={<ListAddonsSectionSkeleton />}>
						<ListAddonsSection listId={list.id} />
					</Suspense>
				</>
			)}
		</div>
	)
}
