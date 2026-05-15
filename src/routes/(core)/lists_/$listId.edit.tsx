import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound, useRouter } from '@tanstack/react-router'
import { Group as GroupIcon, ListOrdered, Settings2, Shuffle } from 'lucide-react'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { createItemGroup, deleteItemGroup, reorderGroupItems } from '@/api/groups'
import { getAddableEditors, getListEditors } from '@/api/list-editors'
import { getListForEditing, getListSummaries, type ListForEditing, type ListSummary } from '@/api/lists'
import DependentAvatar from '@/components/common/dependent-avatar'
import ListTypeTile from '@/components/common/list-type-tile'
import { MarkdownNotes } from '@/components/common/markdown-notes'
import UserAvatar from '@/components/common/user-avatar'
import { GroupBlock } from '@/components/items/group-block'
import { AddItemSplitButton } from '@/components/items/import/add-item-split-button'
import { InternalListLinksProvider } from '@/components/items/internal-list-links-context'
import { ItemEditRow } from '@/components/items/item-edit-row'
import { ItemFormDialog } from '@/components/items/item-form-dialog'
import { ItemListSkeleton } from '@/components/items/item-list-skeleton'
import { MoveItemDialog } from '@/components/items/move-item-dialog'
import BackToParentList from '@/components/lists/back-to-parent-list'
import { ListSettingsSheet } from '@/components/lists/list-settings-sheet'
import { TodoList } from '@/components/todos/todo-list'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import type { GroupType } from '@/db/schema/enums'
import type { Item } from '@/db/schema/items'
import { buildListEntries } from '@/lib/list-entries'
import { itemsKeys, listItemsEditQueryOptions } from '@/lib/queries/items'
import { parseInternalListLink } from '@/lib/urls'
import { useListSSE } from '@/lib/use-list-sse'
import { useScrollToHash } from '@/lib/use-scroll-to-hash'

type EditSearch = { from?: number; settings?: boolean; edit?: number }

export const Route = createFileRoute('/(core)/lists_/$listId/edit')({
	validateSearch: (search: Record<string, unknown>): EditSearch => {
		const result: EditSearch = {}
		const rawFrom = search.from
		const num = typeof rawFrom === 'number' ? rawFrom : typeof rawFrom === 'string' ? Number(rawFrom) : NaN
		if (Number.isFinite(num) && num > 0) result.from = num
		const rawSettings = search.settings
		if (rawSettings === true || rawSettings === 'true' || rawSettings === 1 || rawSettings === '1') result.settings = true
		const rawEdit = search.edit
		const editNum = typeof rawEdit === 'number' ? rawEdit : typeof rawEdit === 'string' ? Number(rawEdit) : NaN
		if (Number.isFinite(editNum) && editNum > 0) result.edit = editNum
		return result
	},
	loader: async ({ params, context }) => {
		const listId = Number(params.listId)
		if (!Number.isFinite(listId)) throw notFound()

		void context.queryClient.prefetchQuery(listItemsEditQueryOptions(listId))

		const [listResult, editors, addableUsers] = await Promise.all([
			getListForEditing({ data: { listId: params.listId } }),
			getListEditors({ data: { listId } }),
			getAddableEditors({ data: { listId } }),
		])

		if (listResult.kind === 'error') throw notFound()

		return { list: listResult.list, editors, addableUsers }
	},
	component: ListEditPage,
	pendingComponent: ListEditPagePending,
})

function ListEditPagePending() {
	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				<div className="relative flex items-center gap-3">
					<Skeleton className="h-7 w-2/3 max-w-sm flex-1" />
					<Skeleton className="size-8 rounded" />
					<Skeleton className="size-8 rounded" />
				</div>
				<div className="flex flex-col gap-2">
					<div className="flex items-center justify-end gap-2">
						<Skeleton className="h-8 w-24" />
						<Skeleton className="h-8 w-24" />
					</div>
					<ItemListSkeleton />
				</div>
			</div>
		</div>
	)
}

function ListEditPage() {
	const { list, editors, addableUsers } = Route.useLoaderData()
	const { from, settings } = Route.useSearch()
	const router = useRouter()
	const navigate = Route.useNavigate()
	const queryClient = useQueryClient()
	useListSSE(list.id, 'edit')
	const [addItemOpen, setAddItemOpen] = useState(false)
	const [addItemGroupId, setAddItemGroupId] = useState<number | null>(null)
	const [moveItem, setMoveItem] = useState<Item | null>(null)
	useScrollToHash([list.id])

	const initialSettingsOpen = useRef(settings === true).current
	useEffect(() => {
		if (settings) {
			void navigate({ search: (prev: EditSearch) => ({ ...prev, settings: undefined }), replace: true })
		}
	}, [settings, navigate])

	const refreshAfterGroupChange = () =>
		Promise.all([router.invalidate(), queryClient.invalidateQueries({ queryKey: itemsKeys.byList(list.id) })])

	const scrollToGroup = (groupId: number) => {
		let attempts = 0
		const tryScroll = () => {
			const el = document.getElementById(`group-${groupId}`)
			if (el) {
				const rect = el.getBoundingClientRect()
				const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight
				if (!isVisible) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
				return
			}
			if (attempts++ < 20) setTimeout(tryScroll, 50)
		}
		tryScroll()
	}

	const handleCreateGroup = async (type: GroupType) => {
		const result = await createItemGroup({ data: { listId: list.id, type } })
		if (result.kind === 'ok') {
			toast.success(`${type === 'or' ? '"Pick one"' : '"Ordered"'} group created`)
			await refreshAfterGroupChange()
			scrollToGroup(result.group.id)
		} else {
			toast.error('Failed to create group')
		}
	}

	const handleDeleteGroup = async (groupId: number) => {
		const result = await deleteItemGroup({ data: { groupId } })
		if (result.kind === 'ok') {
			toast.success('Group removed (items kept)')
			await refreshAfterGroupChange()
		}
	}

	const handleReorder = async (groupId: number, orderedItems: Array<Item>, fromIndex: number, direction: -1 | 1) => {
		const toIndex = fromIndex + direction
		if (toIndex < 0 || toIndex >= orderedItems.length) return
		const next = orderedItems.slice()
		;[next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]]
		const result = await reorderGroupItems({ data: { groupId, itemIds: next.map(i => i.id) } })
		if (result.kind === 'ok') {
			await refreshAfterGroupChange()
		} else {
			toast.error('Failed to reorder')
		}
	}

	const openAddItemDialog = (groupId: number | null) => {
		setAddItemGroupId(groupId)
		setAddItemOpen(true)
	}

	const onMoveItem = list.isOwner ? setMoveItem : undefined

	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="flex flex-col gap-1">
					<BackToParentList from={from} />
					<div className="flex items-center gap-1 xs:gap-3 min-w-0">
						{list.subjectDependent ? (
							<DependentAvatar
								name={list.subjectDependent.name}
								image={list.subjectDependent.image}
								size="large"
								className="border-2 border-background"
							/>
						) : !list.isOwner ? (
							<UserAvatar
								name={list.owner.name || list.owner.email}
								image={list.owner.image}
								size="large"
								className="border-2 border-background"
							/>
						) : null}
						<ListTypeTile type={list.type} />
						<h1 className="truncate flex-1">{list.name}</h1>
						<ListSettingsSheet
							listId={list.id}
							name={list.name}
							type={list.type}
							isPrivate={list.isPrivate}
							description={list.description}
							giftIdeasTargetUserId={list.giftIdeasTargetUserId}
							subjectDependentId={list.subjectDependentId}
							customHolidayId={list.customHolidayId}
							editors={editors}
							addableUsers={addableUsers}
							isOwner={list.isOwner}
							defaultOpen={initialSettingsOpen}
						/>
					</div>
				</div>
				{list.description && <MarkdownNotes content={list.description} className="text-muted-foreground" />}

				{list.type === 'todos' ? (
					<TodoList listId={list.id} canEdit={list.isOwner} />
				) : (
					<div className="flex flex-col gap-2">
						<div className="flex items-center justify-end">
							<div className="flex gap-2">
								{list.isOwner && (
									<Button size="sm" variant="outline" asChild>
										<Link to="/lists/$listId/organize" params={{ listId: String(list.id) }}>
											<Settings2 className="size-4" />
											<span className="sr-only xs:not-sr-only">Organize</span>
										</Link>
									</Button>
								)}
								{list.isOwner && (
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button size="sm" variant="outline">
												<GroupIcon className="size-4" /> <span className="xs:hidden">Group</span>
												<span className="hidden xs:inline">New Group</span>
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem onClick={() => handleCreateGroup('or')}>
												<Shuffle className="size-4" /> Pick one
											</DropdownMenuItem>
											<DropdownMenuItem onClick={() => handleCreateGroup('order')}>
												<ListOrdered className="size-4" /> In order
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								)}
								<AddItemSplitButton listId={list.id} onAddItem={() => openAddItemDialog(null)} />
							</div>
						</div>

						<Suspense fallback={<ItemListSkeleton />}>
							<EditItemsBody
								list={list}
								onMoveItem={onMoveItem}
								onAddItem={openAddItemDialog}
								onDeleteGroup={handleDeleteGroup}
								onReorder={handleReorder}
							/>
						</Suspense>
					</div>
				)}
			</div>

			{list.type !== 'todos' && (
				<ItemFormDialog
					open={addItemOpen}
					onOpenChange={open => {
						setAddItemOpen(open)
						if (!open) setAddItemGroupId(null)
					}}
					mode="create"
					listId={list.id}
					groupId={addItemGroupId}
				/>
			)}

			{moveItem && (
				<MoveItemDialog
					open={!!moveItem}
					onOpenChange={open => {
						if (!open) setMoveItem(null)
					}}
					item={moveItem}
				/>
			)}
		</div>
	)
}

type EditItemsBodyProps = {
	list: ListForEditing
	onMoveItem: ((item: Item) => void) | undefined
	onAddItem: (groupId: number | null) => void
	onDeleteGroup: (groupId: number) => Promise<void>
	onReorder: (groupId: number, items: Array<Item>, fromIndex: number, direction: -1 | 1) => Promise<void>
}

function EditItemsBody({ list, onMoveItem, onAddItem, onDeleteGroup, onReorder }: EditItemsBodyProps) {
	const { data: items } = useSuspenseQuery(listItemsEditQueryOptions(list.id))
	const entries = buildListEntries({ items, groups: list.groups })

	const internalListIds = useMemo(() => {
		if (typeof window === 'undefined') return [] as Array<number>
		const origin = window.location.origin
		const set = new Set<number>()
		for (const i of items) {
			const hit = parseInternalListLink(i.url, origin)
			if (hit) set.add(hit.listId)
		}
		return [...set].sort((a, b) => a - b)
	}, [items])

	const { data: summaryData } = useQuery({
		queryKey: ['list-summaries', internalListIds],
		queryFn: () => getListSummaries({ data: { listIds: internalListIds } }),
		enabled: internalListIds.length > 0,
		staleTime: 60_000,
	})

	const internalListLinks = useMemo(() => {
		const map = new Map<number, ListSummary>()
		for (const s of summaryData?.summaries ?? []) map.set(s.id, s)
		return map
	}, [summaryData])

	if (items.length === 0 && list.groups.length === 0) {
		return (
			<div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg bg-accent/30">
				No items yet. Click "Add item" to get started.
			</div>
		)
	}

	return (
		<InternalListLinksProvider value={internalListLinks}>
			<div className="flex flex-col gap-2 xs:pl-6">
				{entries.map(entry =>
					entry.kind === 'item' ? (
						<ItemEditRow
							key={`item-${entry.item.id}`}
							item={entry.item}
							commentCount={entry.item.commentCount}
							onMoveClick={onMoveItem}
							groups={list.groups}
						/>
					) : (
						<GroupBlock
							key={`group-${entry.group.id}`}
							group={entry.group}
							items={entry.items}
							groups={list.groups}
							listId={list.id}
							isOwner={list.isOwner}
							onAddItem={onAddItem}
							onDelete={onDeleteGroup}
							onMoveItem={onMoveItem}
							onReorder={onReorder}
						/>
					)
				)}
			</div>
		</InternalListLinksProvider>
	)
}
