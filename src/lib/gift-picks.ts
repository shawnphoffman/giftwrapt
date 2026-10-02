// "Pick for me": rank the things a gifter can still claim on someone's
// lists. Pure and model-free, so it works on deployments with no AI
// configured and can run in the browser on data the gifter view already
// loaded, or on the server for reminder emails.
//
// The claim rules here mirror the server gates in claimItemGiftImpl so a
// pick is something the gifter can actually claim:
// - fully claimed and unavailable items are out,
// - a pick-one ('or') group is locked once any item in it has a claim,
// - in an in-order group only the first item not yet fully claimed is open.

export type PickItem = {
	id: number
	title: string
	// Free-form, as the recipient typed it ("$28", "12 each").
	price: string | null
	currency: string | null
	priority: 'low' | 'normal' | 'high' | 'very-high'
	quantity: number
	// How many are already claimed, by anyone.
	claimedQuantity: number
	availability: 'available' | 'unavailable'
	groupId: number | null
	groupSortOrder: number | null
	url: string | null
	imageUrl: string | null
}

export type PickGroup = { id: number; type: 'or' | 'order' }

export type Pick = {
	item: PickItem
	// Short, plain reasons in display order, e.g. ['High priority', 'Within budget'].
	reasons: Array<string>
}

const PRIORITY_SCORE: Record<PickItem['priority'], number> = { 'very-high': 40, high: 30, normal: 20, low: 10 }
const PRIORITY_REASON: Partial<Record<PickItem['priority'], string>> = { 'very-high': 'Top priority', high: 'High priority' }

/** The first number in a free-form price, or null when there is none. */
export function parsePrice(price: string | null): number | null {
	if (!price) return null
	const match = /\d+(?:[.,]\d+)?/u.exec(price.replace(/(\d),(\d{3})/gu, '$1$2'))
	if (!match) return null
	const n = Number.parseFloat(match[0].replace(',', '.'))
	return Number.isFinite(n) ? n : null
}

/** Items the viewer could claim right now, by the same rules the server enforces. */
export function claimableItems(items: ReadonlyArray<PickItem>, groups: ReadonlyArray<PickGroup>): Array<PickItem> {
	const groupType = new Map(groups.map(g => [g.id, g.type]))
	const byGroup = new Map<number, Array<PickItem>>()
	for (const item of items) {
		if (item.groupId === null) continue
		const list = byGroup.get(item.groupId) ?? []
		list.push(item)
		byGroup.set(item.groupId, list)
	}
	return items.filter(item => {
		if (item.availability === 'unavailable') return false
		if (item.claimedQuantity >= item.quantity) return false
		if (item.groupId === null) return true
		const siblings = byGroup.get(item.groupId) ?? []
		const type = groupType.get(item.groupId)
		if (type === 'or') return !siblings.some(s => s.claimedQuantity > 0)
		if (type === 'order') {
			const ordered = [...siblings].sort((a, b) => (a.groupSortOrder ?? 0) - (b.groupSortOrder ?? 0) || a.id - b.id)
			const next = ordered.find(s => s.claimedQuantity < s.quantity)
			return next?.id === item.id
		}
		return true
	})
}

/**
 * The best few things to give, most wanted first. With a budget, anything
 * priced over it is left out and priced items within it rank above items
 * with no price.
 */
export function rankPicks(
	items: ReadonlyArray<PickItem>,
	groups: ReadonlyArray<PickGroup>,
	options: { budget?: number | null; limit?: number } = {}
): Array<Pick> {
	const budget = options.budget ?? null
	const limit = options.limit ?? 3
	const scored: Array<{ pick: Pick; score: number }> = []
	for (const item of claimableItems(items, groups)) {
		const price = parsePrice(item.price)
		if (budget !== null && price !== null && price > budget) continue
		const reasons: Array<string> = []
		let score = PRIORITY_SCORE[item.priority]
		const priorityReason = PRIORITY_REASON[item.priority]
		if (priorityReason) reasons.push(priorityReason)
		if (budget !== null) {
			if (price !== null) {
				// Closer to the budget ranks a little higher: a $45 gift fits a
				// $50 budget better than a $4 one.
				score += 8 + 4 * (price / budget)
				reasons.push('Within budget')
			} else {
				reasons.push('No price listed')
			}
		}
		if (item.claimedQuantity > 0) reasons.push(`${item.quantity - item.claimedQuantity} of ${item.quantity} left`)
		else reasons.push('Nobody has claimed it')
		scored.push({ pick: { item, reasons }, score })
	}
	return scored
		.sort((a, b) => b.score - a.score || a.pick.item.id - b.pick.item.id)
		.slice(0, limit)
		.map(s => s.pick)
}
