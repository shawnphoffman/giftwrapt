import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { ArrowRightLeft, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { Fragment, useState } from 'react'
import { toast } from 'sonner'

import { updateItemGroup } from '@/api/groups'
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
import type { Priority } from '@/db/schema/enums'
import type { Item } from '@/db/schema/items'
import { priorityRingClass, priorityTabBgClass } from '@/lib/priority-classes'
import { itemsKeys } from '@/lib/queries/items'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

import { GroupBadge } from './group-badge'
import { GroupConnector } from './group-connector'
import { GroupEditDialog } from './group-edit-dialog'
import { ItemEditRow } from './item-edit-row'
import { MoveGroupDialog } from './move-group-dialog'
import { PriorityQuickPicker } from './priority-quick-picker'

type Props = {
	group: GroupSummary
	items: Array<ItemForEditing>
	groups: Array<GroupSummary>
	listId: number
	onAddItem: (groupId: number) => void
	onDelete: (groupId: number) => void
	onMoveItem?: (item: Item) => void
	onReorder: (groupId: number, orderedItems: Array<Item>, fromIndex: number, direction: -1 | 1) => void
}

export function GroupBlock({ group, items, groups, listId, onAddItem, onDelete, onMoveItem, onReorder }: Props) {
	const [editOpen, setEditOpen] = useState(false)
	const [moveOpen, setMoveOpen] = useState(false)
	// Controlled so the inline priority buttons can close it (see PriorityQuickPicker).
	const [menuOpen, setMenuOpen] = useState(false)
	const router = useRouter()
	const queryClient = useQueryClient()
	// Both group types reorder: "in order" for the claim sequence, "pick one"
	// so the recipient can put the one they want most on top.
	const showReorder = items.length > 1

	const hasPriorityTab = group.priority !== 'normal'

	const handleSetPriority = async (priority: Priority) => {
		if (priority === group.priority) return
		const result = await updateItemGroup({ data: { groupId: group.id, priority } })
		if (result.kind === 'ok') {
			toast.success(m.items_priority_toast_updated())
			// Group rows come from the route loader, and group priority flips the
			// items' effective sort order, so both refetch (same as GroupEditDialog).
			await Promise.all([router.invalidate(), queryClient.invalidateQueries({ queryKey: itemsKeys.byList(listId) })])
		} else {
			toast.error(m.items_priority_toast_failed())
		}
	}

	return (
		<div id={`group-${group.id}`} className="relative scroll-mt-24">
			{hasPriorityTab && (
				<div
					className={cn(
						'absolute left-0 top-0 h-[calc(100%-0.25rem)] max-h-16 -translate-x-1/2 translate-y-0.5 w-12 rounded-md shadow-sm drop-shadow-[1px_1px_10px_rgb(0_0_0_/_0.2)] dark:drop-shadow-[1px_1px_10px_rgb(0_0_0_/_0.5)] hidden xs:flex items-center p-1 z-0',
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
					<Button
						variant="outline"
						size="icon-xs"
						onClick={() => onAddItem(group.id)}
						title={m.items_group_add_item_label()}
						aria-label={m.items_group_add_item_label()}
					>
						<Plus />
					</Button>
					<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" size="icon-xs" title={m.items_group_actions_label()} aria-label={m.items_group_actions_label()}>
								<MoreHorizontal className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => setEditOpen(true)}>
								<Pencil className="size-4" /> {m.action_edit()}
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setMoveOpen(true)}>
								<ArrowRightLeft className="size-4" /> {m.items_action_move_to()}
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<PriorityQuickPicker
								value={group.priority}
								onSelect={priority => {
									setMenuOpen(false)
									void handleSetPriority(priority)
								}}
							/>
							<DropdownMenuSeparator />
							<DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(group.id)}>
								<Trash2 className="size-4" /> {m.action_delete()}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
				{items.length === 0 ? (
					<div className="text-xs text-muted-foreground p-3 m-1 text-center border border-dashed rounded-lg">{m.items_group_empty()}</div>
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
			<GroupEditDialog open={editOpen} onOpenChange={setEditOpen} group={group} listId={listId} />
			<MoveGroupDialog open={moveOpen} onOpenChange={setMoveOpen} group={group} itemCount={items.length} sourceListId={listId} />
		</div>
	)
}
