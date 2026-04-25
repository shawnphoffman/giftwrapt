import { createFileRoute, Link, notFound, useRouter } from '@tanstack/react-router'
import { Group as GroupIcon, ListOrdered, Plus, Settings2, Shuffle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { createItemGroup, deleteItemGroup, reorderGroupItems } from '@/api/groups'
import { getAddableEditors, getListEditors } from '@/api/list-editors'
import { getListForEditing } from '@/api/lists'
import ListTypeIcon from '@/components/common/list-type-icon'
import { MarkdownNotes } from '@/components/common/markdown-notes'
import { GroupBlock } from '@/components/items/group-block'
import { ItemEditRow } from '@/components/items/item-edit-row'
import { ItemFormDialog } from '@/components/items/item-form-dialog'
import { MoveItemDialog } from '@/components/items/move-item-dialog'
import { ListSettingsSheet } from '@/components/lists/list-settings-sheet'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { GroupType } from '@/db/schema/enums'
import type { Item } from '@/db/schema/items'
import { buildListEntries } from '@/lib/list-entries'
import { useScrollToHash } from '@/lib/use-scroll-to-hash'

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
	useScrollToHash([list.id])

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

	const openAddItemDialog = (groupId: number | null) => {
		setAddItemGroupId(groupId)
		setAddItemOpen(true)
	}

	const entries = buildListEntries(list)
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
							{list.isOwner && list.items.length > 0 && (
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

					{list.items.length === 0 && list.groups.length === 0 ? (
						<div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg bg-accent/30">
							No items yet. Click "Add item" to get started.
						</div>
					) : (
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
										isOwner={list.isOwner}
										onAddItem={openAddItemDialog}
										onDelete={handleDeleteGroup}
										onMoveItem={onMoveItem}
										onReorder={handleReorder}
									/>
								)
							)}
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
					onOpenChange={open => {
						if (!open) setMoveItem(null)
					}}
					item={moveItem}
				/>
			)}
		</div>
	)
}
