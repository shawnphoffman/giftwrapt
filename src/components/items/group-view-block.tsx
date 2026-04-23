import { Fragment } from 'react'

import type { GroupSummary, ItemWithGifts } from '@/api/lists'
import PriorityIcon from '@/components/common/priority-icon'
import { computeRemainingClaimableQuantity } from '@/lib/gifts'
import { priorityRingClass, priorityTabBgClass } from '@/lib/priority-classes'
import { cn } from '@/lib/utils'

import { GroupBadge } from './group-badge'
import { GroupConnector } from './group-connector'
import ItemRow, { type LockReason } from './item-row'

type Props = {
	group: GroupSummary
	items: Array<ItemWithGifts>
}

export function GroupViewBlock({ group, items }: Props) {
	if (items.length === 0) return null

	// Group locking rules, mirroring the server guards in api/gifts.ts.
	const lockByItemId = new Map<number, LockReason>()
	if (group.type === 'order') {
		let sawUnfilled = false
		for (const item of items) {
			if (sawUnfilled) lockByItemId.set(item.id, 'order')
			if (!sawUnfilled) {
				const remaining = computeRemainingClaimableQuantity(
					item.quantity,
					item.gifts.map(g => ({ quantity: g.quantity }))
				)
				if (remaining > 0) sawUnfilled = true
			}
		}
	} else {
		const anyClaimed = items.some(i => i.gifts.length > 0)
		if (anyClaimed) {
			for (const item of items) {
				if (item.gifts.length === 0) lockByItemId.set(item.id, 'or')
			}
		}
	}

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
				<div
					aria-hidden
					className={cn(
						'pointer-events-none absolute inset-0 z-20 rounded-lg ring-1 ring-inset ring-border',
						priorityRingClass[group.priority]
					)}
				/>
				<div className="flex items-center gap-2 px-2 py-1 border-b bg-accent ps-4">
					<span className="opacity-75 flex items-center gap-2 overflow-hidden">
						{group.name && (
							<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate translate-y-px">
								{group.name}
							</span>
						)}
						<GroupBadge type={group.type} />
					</span>
				</div>
				<div className="overflow-hidden">
					{items.map((item, index) => (
						<Fragment key={item.id}>
							{index > 0 && <GroupConnector type={group.type} />}
							<ItemRow item={item} lockReason={lockByItemId.get(item.id)} grouped />
						</Fragment>
					))}
				</div>
			</div>
		</div>
	)
}
