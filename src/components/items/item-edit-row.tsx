import { useIsMutating } from '@tanstack/react-query'
import {
	ArrowDown,
	ArrowRightLeft,
	ArrowUp,
	Group,
	ListOrdered,
	Loader2,
	MoreHorizontal,
	PackageCheck,
	PackageX,
	Pencil,
	Shuffle,
	Trash2,
	Ungroup,
} from 'lucide-react'
import { memo, useState } from 'react'
import { toast } from 'sonner'

import type { GroupSummary } from '@/api/lists'
import ListLinkBadge from '@/components/common/list-link-badge'
import { MarkdownNotes } from '@/components/common/markdown-notes'
import PriorityIcon from '@/components/common/priority-icon'
import UrlBadge from '@/components/common/url-badge'
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
import { useAssignItemsToGroup } from '@/lib/mutations/assign-items-to-group'
import { useDeleteItem } from '@/lib/mutations/delete-item'
import { useToggleItemAvailability } from '@/lib/mutations/toggle-item-availability'
import { priorityRingClass, priorityTabBgClass } from '@/lib/priority-classes'
import { parseInternalListLink } from '@/lib/urls'
import { cn } from '@/lib/utils'

import { useInternalListLinks } from './internal-list-links-context'
import { ItemComments } from './item-comments'
import { ItemFormDialog } from './item-form-dialog'
import { ItemImage } from './item-image'
import { PriceQuantityBadge } from './price-quantity-badge'
import { QuantityRemainingBadge } from './quantity-remaining-badge'
import { UnavailableBadge } from './unavailable-badge'

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

export const ItemEditRow = memo(function ItemEditRow({
	item,
	commentCount = 0,
	onMoveClick,
	groups = [],
	grouped = false,
	onMoveUp,
	onMoveDown,
}: Props) {
	const { data: session } = useSession()
	const isAdmin = session?.user.isAdmin
	const [editOpen, setEditOpen] = useState(false)
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const toggleAvailability = useToggleItemAvailability()
	const assignGroup = useAssignItemsToGroup()
	const deleteOne = useDeleteItem()
	const isSaving =
		useIsMutating({
			mutationKey: ['updateItem'],
			predicate: m => {
				const vars = m.state.variables as { itemId?: number; itemIds?: ReadonlyArray<number> } | undefined
				if (vars?.itemId === item.id) return true
				if (vars?.itemIds?.includes(item.id)) return true
				return false
			},
		}) > 0

	const internalListLinks = useInternalListLinks()
	const internalLinkHit = item.url && typeof window !== 'undefined' ? parseInternalListLink(item.url, window.location.origin) : null
	const internalListSummary = internalLinkHit ? internalListLinks.get(internalLinkHit.listId) : undefined

	const otherGroups = groups.filter(g => g.id !== item.groupId)
	const hasCurrentGroup = item.groupId != null && groups.some(g => g.id === item.groupId)

	const handleAssignGroup = async (groupId: number | null) => {
		const result = await assignGroup.mutateAsync({ listId: item.listId, itemIds: [item.id], groupId })
		if (result.kind === 'ok') {
			toast.success(groupId === null ? 'Removed from group' : 'Added to group')
		} else {
			toast.error('Failed to update group')
		}
	}

	const isUnavailable = item.availability === 'unavailable'
	const handleToggleAvailability = async () => {
		const next = isUnavailable ? 'available' : 'unavailable'
		const result = await toggleAvailability.mutateAsync({ listId: item.listId, itemId: item.id, availability: next })
		if (result.kind === 'ok') {
			toast.success(next === 'unavailable' ? 'Marked as unavailable' : 'Marked as available')
		} else {
			toast.error('Failed to update availability')
		}
	}

	const handleDelete = async () => {
		setDeleteDialogOpen(false)
		const result = await deleteOne.mutateAsync({ listId: item.listId, itemId: item.id })
		if (result.kind === 'ok') {
			toast.success('Item deleted')
		} else {
			toast.error('Failed to delete item')
		}
	}

	// Standalone rows get a peeking priority tab on the left; grouped rows stay
	// simple since their parent group owns the priority indicator.
	const hasPriorityTab = !grouped && item.priority !== 'normal'
	const dimmed = isUnavailable

	const hasContentRow = !!(item.notes || item.imageUrl || onMoveUp || onMoveDown)

	const rowInner = (
		<div className="flex flex-col w-full gap-2 scroll-mt-24" id={`item-${item.id}`}>
			{/* HEADER */}
			<div className="flex items-center gap-2 font-medium leading-tight">
				<span className={cn('truncate min-w-0', dimmed && 'opacity-60')}>{item.title}</span>
				{internalListSummary ? (
					<ListLinkBadge listId={internalListSummary.id} name={internalListSummary.name} from={item.listId} />
				) : (
					<UrlBadge url={item.url} />
				)}
				<span className="flex-1" />
				{isSaving && <Loader2 className="size-3.5 shrink-0 text-muted-foreground animate-spin" aria-label="Saving" />}
				{isUnavailable && <UnavailableBadge changedAt={item.availabilityChangedAt} />}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Item actions">
							<MoreHorizontal className="size-5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={() => setEditOpen(true)}>
							<Pencil className="size-4" /> Edit
						</DropdownMenuItem>
						{onMoveClick && (
							<DropdownMenuItem onClick={() => onMoveClick(item)}>
								<ArrowRightLeft className="size-4" /> Move to...
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
						<DropdownMenuItem onClick={handleToggleAvailability} disabled={toggleAvailability.isPending}>
							{isUnavailable ? (
								<>
									<PackageCheck className="size-4" /> Mark as available
								</>
							) : (
								<>
									<PackageX className="size-4" /> Mark as unavailable
								</>
							)}
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

			{/* CONTENT */}
			{hasContentRow && (
				<div className="flex flex-row items-start gap-3">
					<div className={cn('flex-1 min-w-0 flex flex-col gap-0.5', dimmed && 'opacity-60')}>
						{item.notes && <MarkdownNotes content={item.notes} className="text-xs text-foreground/75" />}
					</div>
					{item.imageUrl && <ItemImage src={item.imageUrl} alt={item.title} className={cn(dimmed && 'opacity-60')} />}
					{(onMoveUp || onMoveDown) && (
						<div className="flex flex-col shrink-0">
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
				</div>
			)}

			{/* COMMENTS */}
			<ItemComments
				itemId={item.id}
				commentCount={commentCount}
				trailing={
					item.price || item.quantity > 1 ? (
						<div className={cn('flex items-center gap-2', dimmed && 'opacity-60')}>
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
								'absolute left-0 top-0 h-[calc(100%-4px)] -translate-x-1/2 translate-y-[2px] w-12 rounded-md shadow-sm drop-shadow-[1px_1px_10px_rgb(0_0_0_/_0.2)] dark:drop-shadow-[1px_1px_10px_rgb(0_0_0_/_0.5)] hidden xs:flex items-center p-1 z-0',
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
})
