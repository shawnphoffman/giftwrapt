// How claimed each category is, for the gifter view. Never used on the
// owner's edit view: the owner must not see claims (docs/logic.md "Item
// categories"). Pure and client-safe; it only ever sees the items the
// viewer was sent, so a restricted viewer's counts cover what they can see.

import type { ItemWithGifts } from '@/api/items'
import { computeRemainingClaimableQuantity } from '@/lib/gifts'
import { type CategoryKey, categoryKeyOfEntry } from '@/lib/item-categories'
import type { ListEntry } from '@/lib/list-entries'

export type CategoryClaimStats = { total: number; claimed: number }

function isFullyClaimed(item: ItemWithGifts): boolean {
	return (
		computeRemainingClaimableQuantity(
			item.quantity,
			item.gifts.map(g => ({ quantity: g.quantity }))
		) === 0
	)
}

// Whether a list entry needs nothing more from gifters. An item counts once
// every unit it asks for is claimed. A Pick One group counts as soon as any
// member has a claim, since the rest are then locked. An In Order group
// counts once every member is fully claimed.
export function isEntryClaimed(entry: ListEntry<ItemWithGifts>): boolean {
	if (entry.kind === 'item') return isFullyClaimed(entry.item)
	if (entry.group.type === 'or') return entry.items.some(i => i.gifts.length > 0)
	return entry.items.length > 0 && entry.items.every(isFullyClaimed)
}

// Entries and claimed entries per category key. A group counts once.
export function claimStatsByCategory(
	entries: ReadonlyArray<ListEntry<ItemWithGifts>>,
	known: ReadonlySet<number>
): Map<CategoryKey, CategoryClaimStats> {
	const stats = new Map<CategoryKey, CategoryClaimStats>()
	for (const entry of entries) {
		const key = categoryKeyOfEntry(entry, known)
		const current = stats.get(key) ?? { total: 0, claimed: 0 }
		current.total += 1
		if (isEntryClaimed(entry)) current.claimed += 1
		stats.set(key, current)
	}
	return stats
}
