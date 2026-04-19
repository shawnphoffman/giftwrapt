import { useRouter } from '@tanstack/react-router'
import { Archive, ArrowDown, ArrowUp, ExternalLink, Group, ListOrdered, MoreHorizontal, Pencil, Shuffle, Trash2, Ungroup } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { assignItemsToGroup } from '@/api/groups'
import { archiveItem, deleteItem } from '@/api/items'
import type { GroupSummary } from '@/api/lists'
import { MarkdownNotes } from '@/components/common/markdown-notes'
import PriorityIcon from '@/components/common/priority-icon'
import { cn } from '@/lib/utils'
import { priorityBorderClass } from '@/lib/priority-classes'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Item } from '@/db/schema/items'

import { ItemFormDialog } from './item-form-dialog'
import { PriceQuantityBadge } from './price-quantity-badge'

type Props = {
	item: Item
	onMoveClick?: (item: Item) => void
	groups?: Array<GroupSummary>
	hidePriority?: boolean
	flush?: boolean
	/**
	 * When provided, renders up/down arrow buttons for reordering this item
	 * within its ordered group. Each callback is undefined when the item is
	 * already at the corresponding edge of the group.
	 */
	onMoveUp?: () => void
	onMoveDown?: () => void
}

function getDomain(url: string): string | null {
	try {
		return new URL(url).hostname.replace('www.', '')
	} catch {
		return null
	}
}

export function ItemEditRow({ item, onMoveClick, groups = [], hidePriority = false, flush = false, onMoveUp, onMoveDown }: Props) {
	const router = useRouter()
	const [editOpen, setEditOpen] = useState(false)
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

	const otherGroups = groups.filter(g => g.id !== item.groupId)
	const hasCurrentGroup = item.groupId != null && groups.some(g => g.id === item.groupId)

	const handleAssignGroup = async (groupId: number | null) => {
		const result = await assignItemsToGroup({ data: { groupId, itemIds: [item.id] } })
		if (result.kind === 'ok') {
			toast.success(groupId === null ? 'Removed from group' : 'Added to group')
			await router.invalidate()
		} else {
			toast.error('Failed to update group')
		}
	}

	const handleDelete = async () => {
		const result = await deleteItem({ data: { itemId: item.id } })
		if (result.kind === 'ok') {
			toast.success('Item deleted')
			await router.invalidate()
		} else {
			toast.error('Failed to delete item')
		}
		setDeleteDialogOpen(false)
	}

	const handleArchive = async () => {
		const result = await archiveItem({ data: { itemId: item.id, archived: true } })
		if (result.kind === 'ok') {
			toast.success('Item archived')
			await router.invalidate()
		}
	}

	const domain = item.url ? getDomain(item.url) : null

	return (
		<>
			<div
				className={cn(
					flush
						? 'flex items-center gap-2 p-2 bg-muted/40 border-b last:border-b-0 hover:bg-muted/60'
						: 'flex items-center gap-2 p-2 border rounded-md bg-muted/40 hover:bg-muted/60',
					!flush && priorityBorderClass[item.priority]
				)}
			>
				{!hidePriority && <PriorityIcon priority={item.priority} className="size-4 shrink-0" />}
				<div className="flex-1 min-w-0">
					<div className="font-medium leading-tight truncate">{item.title}</div>
					{domain && (
						<a
							href={item.url!}
							target="_blank"
							rel="noopener noreferrer"
							className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-0.5"
						>
							{domain} <ExternalLink className="size-3" />
						</a>
					)}
					{item.notes && <MarkdownNotes content={item.notes} className="text-xs text-foreground/75 mt-1" />}
				</div>
				<PriceQuantityBadge price={item.price} quantity={item.quantity} />
				{(onMoveUp || onMoveDown) && (
					<div className="flex items-center shrink-0">
						<Button
							variant="ghost"
							size="icon"
							className="size-7"
							onClick={onMoveUp}
							disabled={!onMoveUp}
							title="Move up"
							aria-label="Move up"
						>
							<ArrowUp className="size-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className="size-7"
							onClick={onMoveDown}
							disabled={!onMoveDown}
							title="Move down"
							aria-label="Move down"
						>
							<ArrowDown className="size-4" />
						</Button>
					</div>
				)}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="size-7 shrink-0">
							<MoreHorizontal className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={() => setEditOpen(true)}>
							<Pencil className="mr-2 size-4" /> Edit
						</DropdownMenuItem>
						{onMoveClick && (
							<DropdownMenuItem onClick={() => onMoveClick(item)}>
								<Archive className="mr-2 size-4" /> Move to...
							</DropdownMenuItem>
						)}
						{groups.length > 0 && (
							<DropdownMenuSub>
								<DropdownMenuSubTrigger>
									<Group className="mr-2 size-4" /> Group
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent>
									{otherGroups.map(g => {
										const GroupTypeIcon = g.type === 'or' ? Shuffle : ListOrdered
										const label = g.name || `${g.type === 'or' ? 'Pick one' : 'In order'} group #${g.id}`
										return (
											<DropdownMenuItem key={g.id} onClick={() => handleAssignGroup(g.id)}>
												<GroupTypeIcon className="mr-2 size-4" /> {label}
											</DropdownMenuItem>
										)
									})}
									{hasCurrentGroup && otherGroups.length > 0 && <DropdownMenuSeparator />}
									{hasCurrentGroup && (
										<DropdownMenuItem onClick={() => handleAssignGroup(null)}>
											<Ungroup className="mr-2 size-4" /> Remove from group
										</DropdownMenuItem>
									)}
								</DropdownMenuSubContent>
							</DropdownMenuSub>
						)}
						<DropdownMenuItem onClick={handleArchive}>
							<Archive className="mr-2 size-4" /> Archive
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="text-destructive focus:text-destructive"
							onClick={() => setDeleteDialogOpen(true)}
						>
							<Trash2 className="mr-2 size-4" /> Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<ItemFormDialog open={editOpen} onOpenChange={setEditOpen} mode="edit" item={item} />

			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete "{item.title}"?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently remove this item and any associated claims or comments.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
