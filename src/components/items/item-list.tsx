import type { GroupSummary, ItemWithGifts } from '@/api/lists'
import EmptyMessage from '@/components/common/empty-message'
import PriorityIcon from '@/components/common/priority-icon'
import { computeRemainingClaimableQuantity } from '@/lib/gifts'

import { GroupBadge } from './group-badge'
import ItemRow from './item-row'

type Props = {
	items: Array<ItemWithGifts>
	groups?: Array<GroupSummary>
}

export default function ItemList({ items, groups = [] }: Props) {
	if (items.length === 0) {
		return <EmptyMessage message="No items to display" />
	}

	// Partition: ungrouped first, then per-group sections.
	const ungrouped = items.filter(i => i.groupId === null)
	const itemsByGroup = new Map<number, Array<ItemWithGifts>>()
	for (const item of items) {
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

	if (groups.length === 0 || itemsByGroup.size === 0) {
		// Fast path: no groups in play, render flat list.
		return (
			<div className="flex flex-col overflow-hidden border divide-y rounded-lg shadow-sm text-card-foreground bg-accent">
				{items.map(item => (
					<ItemRow key={item.id} item={item} />
				))}
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-3">
			{ungrouped.length > 0 && (
				<div className="flex flex-col overflow-hidden border divide-y rounded-lg shadow-sm text-card-foreground bg-accent">
					{ungrouped.map(item => (
						<ItemRow key={item.id} item={item} />
					))}
				</div>
			)}

			{groups.map(group => {
				const groupItems = itemsByGroup.get(group.id) ?? []
				if (groupItems.length === 0) return null

				// For 'order' groups: only the first not-fully-claimed item is
				// claimable. Everything after it is locked until the active one
				// is fully taken. Matches the server-side guard in api/gifts.ts.
				let sawUnfilled = false
				const lockedByItemId = new Map<number, boolean>()
				if (group.type === 'order') {
					for (const item of groupItems) {
						lockedByItemId.set(item.id, sawUnfilled)
						if (!sawUnfilled) {
							const remaining = computeRemainingClaimableQuantity(
								item.quantity,
								item.gifts.map(g => ({ quantity: g.quantity }))
							)
							if (remaining > 0) sawUnfilled = true
						}
					}
				}

				return (
					<div key={group.id} className="border rounded-lg shadow-sm bg-accent overflow-hidden">
						<div className="flex items-center gap-2 p-2 bg-muted/30 border-b">
							<PriorityIcon priority={group.priority} className="size-4 shrink-0" />
							<GroupBadge type={group.type} showHelp />
							{group.name && <span className="font-medium text-sm truncate">{group.name}</span>}
							<span className="text-xs text-muted-foreground ml-auto">
								{group.type === 'or'
									? 'Recipient wants ONE of these'
									: 'Claim in order — top first'}
							</span>
						</div>
						<div className="divide-y">
							{groupItems.map(item => (
								<ItemRow key={item.id} item={item} hidePriority locked={lockedByItemId.get(item.id) ?? false} />
							))}
						</div>
					</div>
				)
			})}
		</div>
	)
}
