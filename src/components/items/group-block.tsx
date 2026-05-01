import { ArrowRightLeft, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { Fragment, useState } from 'react'

import type { GroupSummary, ItemForEditing } from '@/api/lists'
import PriorityIcon from '@/components/common/priority-icon'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Item } from '@/db/schema/items'
import { priorityRingClass, priorityTabBgClass } from '@/lib/priority-classes'
import { cn } from '@/lib/utils'

import { GroupBadge } from './group-badge'
import { GroupConnector } from './group-connector'
import { GroupEditDialog } from './group-edit-dialog'
import { ItemEditRow } from './item-edit-row'
import { MoveGroupDialog } from './move-group-dialog'

type Props = {
	group: GroupSummary
	items: Array<ItemForEditing>
	groups: Array<GroupSummary>
	listId: number
	isOwner: boolean
	onAddItem: (groupId: number) => void
	onDelete: (groupId: number) => void
	onMoveItem?: (item: Item) => void
	onReorder: (groupId: number, orderedItems: Array<Item>, fromIndex: number, direction: -1 | 1) => void
}

export function GroupBlock({ group, items, groups, listId, isOwner, onAddItem, onDelete, onMoveItem, onReorder }: Props) {
	const [editOpen, setEditOpen] = useState(false)
	const [moveOpen, setMoveOpen] = useState(false)
	const showReorder = isOwner && group.type === 'order' && items.length > 1

	const hasPriorityTab = group.priority !== 'normal'

	return (
		<div id={`group-${group.id}`} className="relative scroll-mt-24">
			{hasPriorityTab && (
				<div
					className={cn(
						'absolute left-0 top-0 h-[calc(100%-4px)] -translate-x-1/2 translate-y-[2px] w-12 rounded-md shadow-sm drop-shadow-[1px_1px_10px_rgb(0_0_0_/_0.2)] dark:drop-shadow-[1px_1px_10px_rgb(0_0_0_/_0.5)] hidden xs:flex items-center p-1 z-0',
						priorityTabBgClass[group.priority]
					)}
					aria-hidden
				>
					<PriorityIcon priority={group.priority} className="size-4" />
				</div>
			)}
			<div className="relative z-10 flex flex-col rounded-lg overflow-hidden shadow-sm bg-card px-px">
				{/* Ring overlay: sits on top of all children so their backgrounds
				    can't hide the inset ring. pointer-events-none lets clicks
				    through to the content below. */}
				<div
					aria-hidden
					className={cn(
						'pointer-events-none absolute inset-0 z-20 rounded-lg ring-1 ring-inset ring-border',
						priorityRingClass[group.priority]
					)}
				/>
				<div className="flex items-center gap-1 px-2 py-1 border-b bg-accent ps-4 justify-center">
					<span className={'opacity-75 flex items-center gap-2 justify-between overflow-hidden'}>
						{group.name && (
							<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate translate-y-px">
								{group.name}
							</span>
						)}
						<GroupBadge type={group.type} />
					</span>
					<div className="ml-auto" />
					{isOwner && (
						<Button
							variant="ghost"
							size="icon"
							className="size-7"
							onClick={() => onAddItem(group.id)}
							title="Add item to this group"
							aria-label="Add item to this group"
						>
							<Plus />
						</Button>
					)}
					{isOwner && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" size="icon" className="size-7" title="Group actions" aria-label="Group actions">
									<MoreHorizontal className="size-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onClick={() => setEditOpen(true)}>
									<Pencil className="size-4" /> Edit
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => setMoveOpen(true)}>
									<ArrowRightLeft className="size-4" /> Move to...
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(group.id)}>
									<Trash2 className="size-4" /> Delete
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
				{items.length === 0 ? (
					<div className="text-xs text-muted-foreground p-3 m-1 text-center border border-dashed rounded-lg">
						Empty group. Use the + button above or the "Group" item action to add items here.
					</div>
				) : (
					<div className="overflow-hidden">
						{items.map((item, index) => (
							<Fragment key={item.id}>
								{index > 0 && <GroupConnector type={group.type} />}
								<ItemEditRow
									item={item}
									commentCount={item.commentCount}
									onMoveClick={onMoveItem}
									groups={groups}
									grouped
									onMoveUp={showReorder && index > 0 ? () => onReorder(group.id, items, index, -1) : undefined}
									onMoveDown={showReorder && index < items.length - 1 ? () => onReorder(group.id, items, index, 1) : undefined}
								/>
							</Fragment>
						))}
					</div>
				)}
			</div>
			{isOwner && <GroupEditDialog open={editOpen} onOpenChange={setEditOpen} group={group} listId={listId} />}
			{isOwner && (
				<MoveGroupDialog open={moveOpen} onOpenChange={setMoveOpen} group={group} itemCount={items.length} sourceListId={listId} />
			)}
		</div>
	)
}
