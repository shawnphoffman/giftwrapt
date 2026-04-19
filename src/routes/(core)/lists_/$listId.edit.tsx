import { createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { Group as GroupIcon, ListOrdered, Plus, Shuffle, Trash2 } from 'lucide-react'
import { Fragment, useState } from 'react'
import { toast } from 'sonner'

import { createItemGroup, deleteItemGroup, reorderGroupItems } from '@/api/groups'
import { getAddableEditors, getListEditors } from '@/api/list-editors'
import { getListForEditing } from '@/api/lists'
import ListTypeIcon from '@/components/common/list-type-icon'
import { MarkdownNotes } from '@/components/common/markdown-notes'
import PriorityIcon from '@/components/common/priority-icon'
import { GroupBadge } from '@/components/items/group-badge'
import { GroupConnector } from '@/components/items/group-connector'
import { GroupEditPopover } from '@/components/items/group-edit-popover'
import { ItemEditRow } from '@/components/items/item-edit-row'
import { ItemFormDialog } from '@/components/items/item-form-dialog'
import { MoveItemDialog } from '@/components/items/move-item-dialog'
import { ListSettingsSheet } from '@/components/lists/list-settings-sheet'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { GroupType, Priority } from '@/db/schema/enums'
import type { Item } from '@/db/schema/items'

export const Route = createFileRoute('/(core)/lists_/$listId/edit')({
	loader: async ({ params }) => {
		const listId = Number(params.listId)
		if (!Number.isFinite(listId)) throw notFound()

		const [listResult, editors, addableUsers] = await Promise.all([
			getListForEditing({ data: { listId: params.listId } }),
			getListEditors({ data: { listId } }),
			getAddableEditors({ data: { listId } }),
		])

		if (listResult.kind === 'error') throw notFound()

		return { list: listResult.list, editors, addableUsers }
	},
	component: ListEditPage,
})

function ListEditPage() {
	const { list, editors, addableUsers } = Route.useLoaderData()
	const router = useRouter()
	const [addItemOpen, setAddItemOpen] = useState(false)
	const [addItemGroupId, setAddItemGroupId] = useState<number | null>(null)
	const [moveItem, setMoveItem] = useState<Item | null>(null)

	const handleCreateGroup = async (type: GroupType) => {
		const result = await createItemGroup({ data: { listId: list.id, type } })
		if (result.kind === 'ok') {
			toast.success(`${type === 'or' ? '"Pick one"' : '"Ordered"'} group created`)
			await router.invalidate()
		} else {
			toast.error('Failed to create group')
		}
	}

	const handleDeleteGroup = async (groupId: number) => {
		const result = await deleteItemGroup({ data: { groupId } })
		if (result.kind === 'ok') {
			toast.success('Group removed (items kept)')
			await router.invalidate()
		}
	}

	const handleReorder = async (groupId: number, orderedItems: Array<Item>, fromIndex: number, direction: -1 | 1) => {
		const toIndex = fromIndex + direction
		if (toIndex < 0 || toIndex >= orderedItems.length) return
		const next = orderedItems.slice()
		;[next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]]
		const result = await reorderGroupItems({ data: { groupId, itemIds: next.map(i => i.id) } })
		if (result.kind === 'ok') {
			await router.invalidate()
		} else {
			toast.error('Failed to reorder')
		}
	}

	// Merge ungrouped items and groups into a single, priority-sorted list so
	// priority is a universal axis across both kinds of entries.
	const priorityRank: Record<Priority, number> = { 'very-high': 4, high: 3, normal: 2, low: 1 }
	const ungroupedItems = list.items.filter(i => i.groupId === null)
	const itemsByGroup = new Map<number, Array<Item>>()
	for (const item of list.items) {
		if (item.groupId !== null) {
			if (!itemsByGroup.has(item.groupId)) itemsByGroup.set(item.groupId, [])
			itemsByGroup.get(item.groupId)!.push(item)
		}
	}
	for (const arr of itemsByGroup.values()) {
		arr.sort((a, b) => {
			const aOrder = a.groupSortOrder ?? Number.MAX_SAFE_INTEGER
			const bOrder = b.groupSortOrder ?? Number.MAX_SAFE_INTEGER
			if (aOrder !== bOrder) return aOrder - bOrder
			return a.id - b.id
		})
	}

	type Entry =
		| { kind: 'item'; priority: Priority; id: number; item: Item }
		| { kind: 'group'; priority: Priority; id: number; group: (typeof list.groups)[number]; items: Array<Item> }
	const entries: Array<Entry> = [
		...ungroupedItems.map((item): Entry => ({ kind: 'item', priority: item.priority, id: item.id, item })),
		...list.groups.map((group): Entry => ({
			kind: 'group',
			priority: group.priority,
			id: group.id,
			group,
			items: itemsByGroup.get(group.id) ?? [],
		})),
	]
	entries.sort((a, b) => {
		const rDiff = priorityRank[b.priority] - priorityRank[a.priority]
		if (rDiff !== 0) return rDiff
		return a.id - b.id
	})

	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative flex items-center gap-3">
					<h1 className="truncate flex-1">{list.name}</h1>
					{list.isOwner && (
						<ListSettingsSheet
							listId={list.id}
							name={list.name}
							type={list.type}
							isPrivate={list.isPrivate}
							description={list.description}
							editors={editors}
							addableUsers={addableUsers}
						/>
					)}
					<ListTypeIcon type={list.type} className="wish-page-icon" />
				</div>
				{list.description && <MarkdownNotes content={list.description} className="text-muted-foreground" />}

				{/* ITEMS */}
				<div className="flex flex-col gap-2">
					<div className="flex items-center justify-end">
						<div className="flex gap-2">
							{list.isOwner && (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button size="sm" variant="outline">
											<GroupIcon className="mr-1 size-4" /> New group
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem onClick={() => handleCreateGroup('or')}>
											<Shuffle className="mr-2 size-4" /> Pick one
										</DropdownMenuItem>
										<DropdownMenuItem onClick={() => handleCreateGroup('order')}>
											<ListOrdered className="mr-2 size-4" /> In order
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							)}
							<Button
								size="sm"
								onClick={() => {
									setAddItemGroupId(null)
									setAddItemOpen(true)
								}}
							>
								<Plus className="mr-1 size-4" /> Add item
							</Button>
						</div>
					</div>

					{list.items.length === 0 && list.groups.length === 0 ? (
						<div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg bg-accent/30">
							No items yet. Click "Add item" to get started.
						</div>
					) : (
						<div className="flex flex-col gap-2">
							{entries.map(entry => {
								if (entry.kind === 'item') {
									return (
										<ItemEditRow
											key={`item-${entry.item.id}`}
											item={entry.item}
											onMoveClick={list.isOwner ? setMoveItem : undefined}
											groups={list.groups}
										/>
									)
								}
								const { group, items: groupItems } = entry
								const useConnector = group.type === 'or' || group.type === 'order'
								return (
									<div key={`group-${group.id}`} className="flex flex-col rounded-md overflow-hidden bg-background border">
										<div className="flex items-center gap-2 p-2 border-b bg-muted/70">
											<PriorityIcon priority={group.priority} className="size-4 shrink-0" />
											{group.name && <span className="font-medium text-sm truncate">{group.name}</span>}
											<GroupBadge type={group.type} showHelp />
											<div className="ml-auto" />
											{list.isOwner && (
												<Button
													variant="ghost"
													size="icon"
													className="size-7"
													onClick={() => {
														setAddItemGroupId(group.id)
														setAddItemOpen(true)
													}}
													title="Add item to this group"
													aria-label="Add item to this group"
												>
													<Plus className="size-4" />
												</Button>
											)}
											{list.isOwner && <GroupEditPopover group={group} />}
											{list.isOwner && (
												<Button
													variant="ghost"
													size="icon"
													className="size-7 text-destructive"
													onClick={() => handleDeleteGroup(group.id)}
													title="Delete group (items remain)"
												>
													<Trash2 className="size-4" />
												</Button>
											)}
										</div>
										{groupItems.length === 0 ? (
											<div className="text-xs text-muted-foreground p-3 m-1 text-center border border-dashed rounded-lg bg-accent/30">
												Empty group. Use the + button above or the "Group" item action to add items here.
											</div>
										) : (
											<div className="overflow-hidden">
												{groupItems.map((item, index) => {
													const showReorder = list.isOwner && group.type === 'order' && groupItems.length > 1
													return (
														<Fragment key={item.id}>
															{useConnector && index > 0 && <GroupConnector type={group.type} />}
															<ItemEditRow
																item={item}
																onMoveClick={list.isOwner ? setMoveItem : undefined}
																groups={list.groups}
																hidePriority
																flush
																onMoveUp={showReorder && index > 0 ? () => handleReorder(group.id, groupItems, index, -1) : undefined}
																onMoveDown={
																	showReorder && index < groupItems.length - 1
																		? () => handleReorder(group.id, groupItems, index, 1)
																		: undefined
																}
															/>
														</Fragment>
													)
												})}
											</div>
										)}
									</div>
								)
							})}
						</div>
					)}
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
					onOpenChange={open => { if (!open) setMoveItem(null) }}
					item={moveItem}
				/>
			)}
		</div>
	)
}
