import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound, useRouter } from '@tanstack/react-router'
import { Group as GroupIcon, ListOrdered, Plus, Settings2, Shuffle } from 'lucide-react'
import { Suspense, useState } from 'react'
import { toast } from 'sonner'

import { createItemGroup, deleteItemGroup, reorderGroupItems } from '@/api/groups'
import { getAddableEditors, getListEditors } from '@/api/list-editors'
import { getListForEditing, type ListForEditing } from '@/api/lists'
import ListTypeIcon from '@/components/common/list-type-icon'
import { MarkdownNotes } from '@/components/common/markdown-notes'
import { GroupBlock } from '@/components/items/group-block'
import { ItemEditRow } from '@/components/items/item-edit-row'
import { ItemFormDialog } from '@/components/items/item-form-dialog'
import { ItemListSkeleton } from '@/components/items/item-list-skeleton'
import { MoveItemDialog } from '@/components/items/move-item-dialog'
import { ListSettingsSheet } from '@/components/lists/list-settings-sheet'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import type { GroupType } from '@/db/schema/enums'
import type { Item } from '@/db/schema/items'
import { buildListEntries } from '@/lib/list-entries'
import { itemsKeys, listItemsEditQueryOptions } from '@/lib/queries/items'
import { useScrollToHash } from '@/lib/use-scroll-to-hash'

export const Route = createFileRoute('/(core)/lists_/$listId/edit')({
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
	const router = useRouter()
	const queryClient = useQueryClient()
	const [addItemOpen, setAddItemOpen] = useState(false)
	const [addItemGroupId, setAddItemGroupId] = useState<number | null>(null)
	const [moveItem, setMoveItem] = useState<Item | null>(null)
	useScrollToHash([list.id])

	const refreshAfterGroupChange = () =>
		Promise.all([router.invalidate(), queryClient.invalidateQueries({ queryKey: itemsKeys.byList(list.id) })])

	const handleCreateGroup = async (type: GroupType) => {
		const result = await createItemGroup({ data: { listId: list.id, type } })
		if (result.kind === 'ok') {
			toast.success(`${type === 'or' ? '"Pick one"' : '"Ordered"'} group created`)
			await refreshAfterGroupChange()
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
				<div className="relative flex items-center gap-3">
					<h1 className="truncate flex-1">{list.name}</h1>
					<ListSettingsSheet
						listId={list.id}
						name={list.name}
						type={list.type}
						isPrivate={list.isPrivate}
						description={list.description}
						giftIdeasTargetUserId={list.giftIdeasTargetUserId}
						editors={editors}
						addableUsers={addableUsers}
						isOwner={list.isOwner}
					/>
					<ListTypeIcon type={list.type} className="wish-page-icon" />
				</div>
				{list.description && <MarkdownNotes content={list.description} className="text-muted-foreground" />}

				{/* ITEMS */}
				<div className="flex flex-col gap-2">
					<div className="flex items-center justify-end">
						<div className="flex gap-2">
							{list.isOwner && (
								<Button size="sm" variant="outline" asChild>
									<Link to="/lists/$listId/organize" params={{ listId: String(list.id) }}>
										<Settings2 className="size-4" /> Organize
									</Link>
								</Button>
							)}
							{list.isOwner && (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button size="sm" variant="outline">
											<GroupIcon className="size-4" /> New group
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
							<Button size="sm" onClick={() => openAddItemDialog(null)}>
								<Plus className="size-4" /> Add item
							</Button>
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
			</div>

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

	if (items.length === 0 && list.groups.length === 0) {
		return (
			<div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg bg-accent/30">
				No items yet. Click "Add item" to get started.
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-2 pl-6">
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
	)
}
