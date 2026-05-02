import { describe, expect, it } from 'vitest'

import type { SummaryItem } from '@/api/purchases'

import { groupByPerson } from '../purchases-grouping'

function item(overrides: Partial<SummaryItem> = {}): SummaryItem {
	return {
		type: 'claim',
		giftId: 1,
		addonId: null,
		isOwn: true,
		isPartnerPurchase: false,
		isCoGifter: false,
		title: 'A thing',
		itemUrl: null,
		cost: null,
		totalCostRaw: null,
		notes: null,
		quantity: 1,
		listName: 'Wishlist',
		createdAt: new Date('2026-01-01'),
		recipientKind: 'user',
		subjectDependentId: null,
		ownerId: 'owner-1',
		ownerName: 'Owner One',
		ownerEmail: 'owner1@example.com',
		ownerImage: null,
		...overrides,
	}
}

describe('groupByPerson', () => {
	it('returns an empty array when given no items', () => {
		expect(groupByPerson([])).toEqual([])
	})

	it('groups items by recipient and sums gift vs addon totals separately', () => {
		const groups = groupByPerson([
			item({ ownerId: 'jamie', ownerName: 'Jamie', ownerEmail: 'j@example.com', cost: 50 }),
			item({ ownerId: 'jamie', ownerName: 'Jamie', ownerEmail: 'j@example.com', cost: 30 }),
			item({ type: 'addon', giftId: null, addonId: 1, ownerId: 'jamie', ownerName: 'Jamie', ownerEmail: 'j@example.com', cost: 10 }),
		])
		expect(groups).toHaveLength(1)
		expect(groups[0]).toMatchObject({
			key: 'jamie',
			name: 'Jamie',
			claimCount: 2,
			addonCount: 1,
			giftsTotal: 80,
			addonsTotal: 10,
			totalSpent: 90,
		})
	})

	it('sorts groups by total spent descending', () => {
		const groups = groupByPerson([
			item({ ownerId: 'a', ownerName: 'A', ownerEmail: 'a@x', cost: 20 }),
			item({ ownerId: 'b', ownerName: 'B', ownerEmail: 'b@x', cost: 100 }),
			item({ ownerId: 'c', ownerName: 'C', ownerEmail: 'c@x', cost: 50 }),
		])
		expect(groups.map(g => g.name)).toEqual(['B', 'C', 'A'])
	})

	it('keeps partnered recipients in separate groups', () => {
		// Partners are intentionally not merged on the purchases (spending) side.
		// Each recipient gets their own row even when they're partners.
		const groups = groupByPerson([
			item({ ownerId: 'alice', ownerName: 'Alice', ownerEmail: 'alice@x', cost: 40 }),
			item({ ownerId: 'bob', ownerName: 'Bob', ownerEmail: 'bob@x', cost: 60 }),
		])
		expect(groups).toHaveLength(2)
		expect(groups.map(g => g.name).sort()).toEqual(['Alice', 'Bob'])
	})

	it('counts co-gifter claims but leaves totals unchanged (cost is zero)', () => {
		// Co-gifter claims are surfaced with cost=0 until per-gifter spend exists.
		// They should count toward claimCount but not inflate totals.
		const groups = groupByPerson([
			item({ ownerId: 'sam', ownerName: 'Sam', ownerEmail: 'sam@x', cost: 100 }),
			item({ ownerId: 'sam', ownerName: 'Sam', ownerEmail: 'sam@x', isOwn: false, isCoGifter: true, cost: 0 }),
		])
		expect(groups).toHaveLength(1)
		expect(groups[0]).toMatchObject({
			claimCount: 2,
			giftsTotal: 100,
			totalSpent: 100,
		})
	})

	it('uses email as display name when name is null', () => {
		const groups = groupByPerson([item({ ownerId: 'alice', ownerName: null, ownerEmail: 'alice@example.com', cost: 10 })])
		expect(groups[0].name).toBe('alice@example.com')
	})
})
