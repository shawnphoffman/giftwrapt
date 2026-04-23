import { Plus, Trash2 } from 'lucide-react'
import { Fragment } from 'react'

import type { GroupSummary, ItemForEditing } from '@/api/lists'
import PriorityIcon from '@/components/common/priority-icon'
import { Button } from '@/components/ui/button'
import type { Item } from '@/db/schema/items'
import { priorityRingClass, priorityTabBgClass } from '@/lib/priority-classes'
import { cn } from '@/lib/utils'

import { GroupBadge } from './group-badge'
import { GroupConnector } from './group-connector'
import { GroupEditPopover } from './group-edit-popover'
import { ItemEditRow } from './item-edit-row'

type Props = {
	group: GroupSummary
	items: Array<ItemForEditing>
	groups: Array<GroupSummary>
	isOwner: boolean
	onAddItem: (groupId: number) => void
	onDelete: (groupId: number) => void
	onMoveItem?: (item: Item) => void
	onReorder: (groupId: number, orderedItems: Array<Item>, fromIndex: number, direction: -1 | 1) => void
}

export function GroupBlock({ group, items, groups, isOwner, onAddItem, onDelete, onMoveItem, onReorder }: Props) {
	const showReorder = isOwner && group.type === 'order' && items.length > 1

	const hasPriorityTab = group.priority !== 'normal'

	return (
		<div className="relative">
			{hasPriorityTab && (
				<div
					className={cn(
						'absolute left-0 top-0 h-[calc(100%-4px)] -translate-x-1/2 translate-y-[2px] w-12 rounded-md shadow-sm flex items-center p-1 z-0',
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
						{group.name && <span className="font-medium truncate leading-none">{group.name}</span>}
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
					{isOwner && <GroupEditPopover group={group} />}
					{isOwner && (
						<Button variant="ghost" size="icon" className="size-7" onClick={() => onDelete(group.id)} title="Delete group (items remain)">
							<Trash2 className="text-destructive" />
						</Button>
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
									flush
									onMoveUp={showReorder && index > 0 ? () => onReorder(group.id, items, index, -1) : undefined}
									onMoveDown={showReorder && index < items.length - 1 ? () => onReorder(group.id, items, index, 1) : undefined}
								/>
							</Fragment>
						))}
					</div>
				)}
			</div>
		</div>
	)
}
