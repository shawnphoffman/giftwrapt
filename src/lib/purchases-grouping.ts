import type { SummaryItem } from '@/api/purchases'

// ===============================
// Purchase summary grouping
// ===============================
// Collapses the flat list of claims + addons into one row per recipient.
// When a recipient has a partnerId and that partner is also a recipient in
// the same list, both partners collapse into a single group so the
// "amount spent per household" totals make sense.

export type PersonGroup = {
	key: string
	name: string
	email: string
	image: string | null
	partnerName: string | null
	items: Array<SummaryItem>
	claimCount: number
	addonCount: number
	giftsTotal: number
	addonsTotal: number
	totalSpent: number
}

export function groupByPerson(items: Array<SummaryItem>): Array<PersonGroup> {
	const map = new Map<string, PersonGroup>()

	function getKey(ownerId: string, ownerPartnerId: string | null): string {
		if (ownerPartnerId && map.has(ownerPartnerId)) return ownerPartnerId
		return ownerId
	}

	function ensure(item: SummaryItem): PersonGroup {
		const key = getKey(item.ownerId, item.ownerPartnerId)
		let group = map.get(key)
		if (!group) {
			group = {
				key: item.ownerId,
				name: item.ownerName || item.ownerEmail,
				email: item.ownerEmail,
				image: item.ownerImage,
				partnerName: null,
				items: [],
				claimCount: 0,
				addonCount: 0,
				giftsTotal: 0,
				addonsTotal: 0,
				totalSpent: 0,
			}
			map.set(item.ownerId, group)
		} else if (key !== item.ownerId && !group.partnerName) {
			group.partnerName = item.ownerName || item.ownerEmail
		}
		return group
	}

	for (const item of items) {
		const group = ensure(item)
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
