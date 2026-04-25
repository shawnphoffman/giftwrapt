import { useRouter } from '@tanstack/react-router'
import {
	Archive,
	ArrowDown,
	ArrowUp,
	ExternalLink,
	Group,
	ListOrdered,
	MoreHorizontal,
	Pencil,
	Shuffle,
	Trash2,
	Ungroup,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { assignItemsToGroup } from '@/api/groups'
import { archiveItem, deleteItem } from '@/api/items'
import type { GroupSummary } from '@/api/lists'
import { MarkdownNotes } from '@/components/common/markdown-notes'
import PriorityIcon from '@/components/common/priority-icon'
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
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Item } from '@/db/schema/items'
import { useSession } from '@/lib/auth-client'
import { priorityRingClass, priorityTabBgClass } from '@/lib/priority-classes'
import { getDomainFromUrl } from '@/lib/urls'
import { cn } from '@/lib/utils'

import { ItemComments } from './item-comments'
import { ItemFormDialog } from './item-form-dialog'
import { ItemImage } from './item-image'
import { PriceQuantityBadge } from './price-quantity-badge'
import { QuantityRemainingBadge } from './quantity-remaining-badge'

type Props = {
	item: Item
	commentCount?: number
	onMoveClick?: (item: Item) => void
	groups?: Array<GroupSummary>
	grouped?: boolean
	/**
	 * When provided, renders up/down arrow buttons for reordering this item
	 * within its ordered group. Each callback is undefined when the item is
	 * already at the corresponding edge of the group.
	 */
	onMoveUp?: () => void
	onMoveDown?: () => void
}

export function ItemEditRow({ item, commentCount = 0, onMoveClick, groups = [], grouped = false, onMoveUp, onMoveDown }: Props) {
	const router = useRouter()
	const { data: session } = useSession()
	const isAdmin = session?.user.isAdmin
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

	const domain = item.url ? getDomainFromUrl(item.url) || null : null
	// Standalone rows get a peeking priority tab on the left; grouped rows stay
	// simple since their parent group owns the priority indicator.
	const hasPriorityTab = !grouped && item.priority !== 'normal'

	const rowInner = (
		<div className="flex flex-col w-full gap-2 scroll-mt-24" id={`item-${item.id}`}>
			<div className="flex items-start gap-2">
				<div className="flex-1 min-w-0 flex flex-col gap-0.5">
					<div className="font-medium leading-tight truncate">{item.title}</div>
					{domain && (
						<a
							href={item.url!}
							target="_blank"
							rel="noopener noreferrer"
							className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-0.5 w-fit"
						>
							{domain} <ExternalLink className="size-3" />
						</a>
					)}
					{item.notes && <MarkdownNotes content={item.notes} className="text-xs text-foreground/75 mt-1" />}
				</div>
				{item.imageUrl && <ItemImage src={item.imageUrl} alt={item.title} />}
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
							<Pencil className="size-4" /> Edit
						</DropdownMenuItem>
						{onMoveClick && (
							<DropdownMenuItem onClick={() => onMoveClick(item)}>
								<Archive className="size-4" /> Move to...
							</DropdownMenuItem>
						)}
						{groups.length > 0 && (
							<DropdownMenuSub>
								<DropdownMenuSubTrigger>
									<Group className="size-4" /> Group
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent>
									{otherGroups.map(g => {
										const GroupTypeIcon = g.type === 'or' ? Shuffle : ListOrdered
										const label = g.name || `${g.type === 'or' ? 'Pick one' : 'In order'} group #${g.id}`
										return (
											<DropdownMenuItem key={g.id} onClick={() => handleAssignGroup(g.id)}>
												<GroupTypeIcon className="size-4" /> {label}
											</DropdownMenuItem>
										)
									})}
									{hasCurrentGroup && otherGroups.length > 0 && <DropdownMenuSeparator />}
									{hasCurrentGroup && (
										<DropdownMenuItem onClick={() => handleAssignGroup(null)}>
											<Ungroup className="size-4" /> Remove from group
										</DropdownMenuItem>
									)}
								</DropdownMenuSubContent>
							</DropdownMenuSub>
						)}
						<DropdownMenuItem onClick={handleArchive}>
							<Archive className="size-4" /> Archive
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteDialogOpen(true)}>
							<Trash2 className="size-4" /> Delete
						</DropdownMenuItem>
						{isAdmin && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuLabel className="text-muted-foreground font-mono text-xs">item #{item.id}</DropdownMenuLabel>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<ItemComments
				itemId={item.id}
				commentCount={commentCount}
				trailing={
					item.price || item.quantity > 1 ? (
						<div className="flex items-center gap-2">
							{item.price && <PriceQuantityBadge price={item.price} quantity={1} hideQuantity />}
							<QuantityRemainingBadge variant="inline-pill" quantity={item.quantity} remaining={item.quantity} firstPerson />
						</div>
					) : null
				}
			/>
		</div>
	)

	return (
		<>
			{grouped ? (
				<div className="flex items-start gap-2 p-2 border-b last:border-b-0 ps-4">{rowInner}</div>
			) : (
				<div className="relative">
					{hasPriorityTab && (
						<div
							className={cn(
								'absolute left-0 top-0 h-[calc(100%-4px)] -translate-x-1/2 translate-y-[2px] w-12 rounded-md shadow-sm flex items-center p-1 z-0',
								priorityTabBgClass[item.priority]
							)}
							aria-hidden
						>
							<PriorityIcon priority={item.priority} className="size-4" />
						</div>
					)}
					<div
						className={cn(
							'relative z-10 flex items-start gap-2 p-2 ps-4 ring-1 ring-inset ring-border rounded-lg bg-card shadow-sm',
							priorityRingClass[item.priority]
						)}
					>
						{rowInner}
					</div>
				</div>
			)}

			<ItemFormDialog open={editOpen} onOpenChange={setEditOpen} mode="edit" item={item} />

			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete "{item.title}"?</AlertDialogTitle>
						<AlertDialogDescription>This will permanently remove this item and any associated claims or comments.</AlertDialogDescription>
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
