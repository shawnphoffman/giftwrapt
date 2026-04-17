import { createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { Group as GroupIcon, ListOrdered, Pencil, Plus, Shuffle, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { createItemGroup, deleteItemGroup } from '@/api/groups'
import { getListEditors } from '@/api/list-editors'
import { getListForEditing } from '@/api/lists'
import type { GroupType } from '@/db/schema/enums'
import type { Item } from '@/db/schema/items'
import { GroupBadge } from '@/components/items/group-badge'
import { ItemEditRow } from '@/components/items/item-edit-row'
import { ItemFormDialog } from '@/components/items/item-form-dialog'
import { ListSettingsSheet } from '@/components/lists/list-settings-sheet'
import { MoveItemDialog } from '@/components/items/move-item-dialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export const Route = createFileRoute('/(core)/lists_/$listId/edit')({
	loader: async ({ params }) => {
		const listId = Number(params.listId)
		if (!Number.isFinite(listId)) throw notFound()

		const [listResult, editors] = await Promise.all([
			getListForEditing({ data: { listId: params.listId } }),
			getListEditors({ data: { listId } }),
		])

		if (listResult.kind === 'error') throw notFound()

		return { list: listResult.list, editors }
	},
	component: ListEditPage,
})

function ListEditPage() {
	const { list, editors } = Route.useLoaderData()
	const router = useRouter()
	const [addItemOpen, setAddItemOpen] = useState(false)
	const [moveItem, setMoveItem] = useState<Item | null>(null)

	const handleCreateGroup = async (type: GroupType) => {
		const result = await createItemGroup({ data: { listId: list.id, type } })
		if (result.kind === 'ok') {
			toast.success(`${type === 'or' ? '"Pick one"' : '"In order"'} group created`)
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

	// Partition items: ungrouped first, then one section per group.
	const ungroupedItems = list.items.filter(i => i.groupId === null)
	const itemsByGroup = new Map<number, Array<Item>>()
	for (const item of list.items) {
		if (item.groupId !== null) {
			if (!itemsByGroup.has(item.groupId)) itemsByGroup.set(item.groupId, [])
			itemsByGroup.get(item.groupId)!.push(item)
		}
	}
	// Sort by groupSortOrder for order groups, by id for or groups.
	for (const arr of itemsByGroup.values()) {
		arr.sort((a, b) => {
			const aOrder = a.groupSortOrder ?? Number.MAX_SAFE_INTEGER
			const bOrder = b.groupSortOrder ?? Number.MAX_SAFE_INTEGER
			if (aOrder !== bOrder) return aOrder - bOrder
			return a.id - b.id
		})
	}

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
						/>
					)}
					<Pencil className="text-blue-500 wish-page-icon" />
				</div>

				{/* ITEMS */}
				<div className="flex flex-col gap-2">
					<div className="flex items-center justify-between">
						<h3>Items</h3>
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
							<Button size="sm" onClick={() => setAddItemOpen(true)}>
								<Plus className="mr-1 size-4" /> Add item
							</Button>
						</div>
					</div>

					{list.items.length === 0 ? (
						<div className="text-sm text-muted-foreground py-6 text-center border rounded-lg bg-accent">
							No items yet. Click "Add item" to get started.
						</div>
					) : (
						<div className="flex flex-col gap-3">
							{/* Ungrouped items */}
							{ungroupedItems.length > 0 && (
								<div className="flex flex-col overflow-hidden border divide-y rounded-lg bg-accent">
									{ungroupedItems.map(item => (
										<ItemEditRow
											key={item.id}
											item={item}
											onMoveClick={list.isOwner ? setMoveItem : undefined}
											groups={list.groups}
										/>
									))}
								</div>
							)}

							{/* Grouped sections */}
							{list.groups.map(group => {
								const groupItems = itemsByGroup.get(group.id) ?? []
								return (
									<div key={group.id} className="border rounded-lg bg-accent overflow-hidden">
										<div className="flex items-center justify-between gap-2 p-2 bg-muted/30 border-b">
											<GroupBadge type={group.type} />
											<span className="text-xs text-muted-foreground flex-1">
												{groupItems.length} item{groupItems.length !== 1 ? 's' : ''}
											</span>
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
											<div className="text-xs text-muted-foreground p-3 text-center">
												Empty group. Use the "Group" item action to add items here.
											</div>
										) : (
											<div className="divide-y">
												{groupItems.map(item => (
													<ItemEditRow
														key={item.id}
														item={item}
														onMoveClick={list.isOwner ? setMoveItem : undefined}
														groups={list.groups}
													/>
												))}
											</div>
										)}
									</div>
								)
							})}
						</div>
					)}
				</div>
			</div>

			<ItemFormDialog open={addItemOpen} onOpenChange={setAddItemOpen} mode="create" listId={list.id} />

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
