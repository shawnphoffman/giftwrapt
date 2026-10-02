import { describe, expect, it } from 'vitest'

import { claimableItems, parsePrice, type PickItem, rankPicks } from '../gift-picks'

let nextId = 1
function item(overrides: Partial<PickItem> = {}): PickItem {
	return {
		id: nextId++,
		title: 'Thing',
		price: null,
		currency: null,
		priority: 'normal',
		quantity: 1,
		claimedQuantity: 0,
		availability: 'available',
		groupId: null,
		groupSortOrder: null,
		url: null,
		imageUrl: null,
		...overrides,
	}
}

describe('parsePrice', () => {
	it('reads the first amount from free-form text', () => {
		expect(parsePrice('$28')).toBe(28)
		expect(parsePrice('12.50 each')).toBe(12.5)
		expect(parsePrice('1,299.00')).toBe(1299)
		expect(parsePrice('about 40')).toBe(40)
		expect(parsePrice('free')).toBeNull()
		expect(parsePrice(null)).toBeNull()
	})
})

describe('claimableItems', () => {
	it('leaves out fully claimed and unavailable items', () => {
		const open = item({ title: 'Open' })
		const part = item({ title: 'Part', quantity: 3, claimedQuantity: 1 })
		const items = [open, part, item({ title: 'Taken', claimedQuantity: 1 }), item({ title: 'Gone', availability: 'unavailable' })]
		expect(claimableItems(items, []).map(i => i.title)).toEqual(['Open', 'Part'])
	})

	it('locks a pick-one group once anything in it is claimed', () => {
		const groups = [
			{ id: 1, type: 'or' as const },
			{ id: 2, type: 'or' as const },
		]
		const items = [
			item({ title: 'A1', groupId: 1 }),
			item({ title: 'A2', groupId: 1, claimedQuantity: 1 }),
			item({ title: 'B1', groupId: 2 }),
			item({ title: 'B2', groupId: 2 }),
		]
		expect(claimableItems(items, groups).map(i => i.title)).toEqual(['B1', 'B2'])
	})

	it('opens only the next unclaimed item of an in-order group', () => {
		const groups = [{ id: 1, type: 'order' as const }]
		const items = [
			item({ title: 'Third', groupId: 1, groupSortOrder: 3 }),
			item({ title: 'First', groupId: 1, groupSortOrder: 1, claimedQuantity: 1 }),
			item({ title: 'Second', groupId: 1, groupSortOrder: 2 }),
		]
		expect(claimableItems(items, groups).map(i => i.title)).toEqual(['Second'])
	})
})

describe('rankPicks', () => {
	it('puts higher priority first and returns three by default', () => {
		const items = [
			item({ title: 'Low', priority: 'low' }),
			item({ title: 'Top', priority: 'very-high' }),
			item({ title: 'Normal' }),
			item({ title: 'High', priority: 'high' }),
		]
		const picks = rankPicks(items, [])
		expect(picks.map(p => p.item.title)).toEqual(['Top', 'High', 'Normal'])
		expect(picks[0].reasons).toEqual(['Top priority', 'Nobody has claimed it'])
		expect(picks[2].reasons).toEqual(['Nobody has claimed it'])
	})

	it('with a budget drops what costs more and ranks priced items above unpriced ones', () => {
		const items = [
			item({ title: 'Too Much', price: '$120', priority: 'very-high' }),
			item({ title: 'No Price' }),
			item({ title: 'Cheap', price: '$5' }),
			item({ title: 'Near Budget', price: '$45' }),
		]
		const picks = rankPicks(items, [], { budget: 50 })
		expect(picks.map(p => p.item.title)).toEqual(['Near Budget', 'Cheap', 'No Price'])
		expect(picks[0].reasons).toContain('Within budget')
		expect(picks[2].reasons).toContain('No price listed')
	})

	it('says how many are left on a partly claimed item, and never picks a locked one', () => {
		const groups = [{ id: 1, type: 'or' as const }]
		const items = [
			item({ title: 'Mugs', quantity: 4, claimedQuantity: 1 }),
			item({ title: 'Locked', groupId: 1, priority: 'very-high' }),
			item({ title: 'Its Sibling', groupId: 1, claimedQuantity: 1 }),
		]
		const picks = rankPicks(items, groups)
		expect(picks.map(p => p.item.title)).toEqual(['Mugs'])
		expect(picks[0].reasons).toEqual(['3 of 4 left'])
	})

	it('returns nothing when nothing can be claimed', () => {
		expect(rankPicks([item({ claimedQuantity: 1 })], [])).toEqual([])
	})
})
