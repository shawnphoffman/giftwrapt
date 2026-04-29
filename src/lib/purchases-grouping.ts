import type { SummaryItem } from '@/api/purchases'

// ===============================
// Purchase summary grouping
// ===============================
// Collapses the flat list of claims + addons into one row per recipient.
// Partners are intentionally not merged here. The purchases page is the
// "spending" side, so each recipient stays their own row. (Partner merging
// happens on the received side, where it represents a shared household.)

export type PersonGroup = {
	key: string
	name: string
	email: string
	image: string | null
	items: Array<SummaryItem>
	claimCount: number
	addonCount: number
	giftsTotal: number
	addonsTotal: number
	totalSpent: number
}

export function groupByPerson(items: Array<SummaryItem>): Array<PersonGroup> {
	const map = new Map<string, PersonGroup>()

	for (const item of items) {
		let group = map.get(item.ownerId)
		if (!group) {
			group = {
				key: item.ownerId,
				name: item.ownerName || item.ownerEmail,
				email: item.ownerEmail,
				image: item.ownerImage,
				items: [],
				claimCount: 0,
				addonCount: 0,
				giftsTotal: 0,
				addonsTotal: 0,
				totalSpent: 0,
			}
			map.set(item.ownerId, group)
		}
		group.items.push(item)
		const cost = item.cost ?? 0
		if (item.type === 'claim') {
			group.claimCount++
			group.giftsTotal += cost
		} else {
			group.addonCount++
			group.addonsTotal += cost
		}
		group.totalSpent += cost
	}

	return Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent)
}
