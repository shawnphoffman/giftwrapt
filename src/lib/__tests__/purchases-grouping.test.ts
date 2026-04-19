import { describe, expect, it } from 'vitest'

import type { SummaryItem } from '@/api/purchases'

import { groupByPerson } from '../purchases-grouping'

function item(overrides: Partial<SummaryItem> = {}): SummaryItem {
	return {
		type: 'claim',
		giftId: 1,
		addonId: null,
		isOwn: true,
		isCoGifter: false,
		title: 'A thing',
		cost: null,
		totalCostRaw: null,
		notes: null,
		quantity: 1,
		listName: 'Wishlist',
		createdAt: new Date('2026-01-01'),
		ownerId: 'owner-1',
		ownerName: 'Owner One',
		ownerEmail: 'owner1@example.com',
		ownerImage: null,
		ownerPartnerId: null,
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

	it('collapses partnered recipients into one group when both appear', () => {
		// Alice + Bob are partners. Both receive gifts. They should collapse
		// into a single household row with the partner name surfaced.
		const groups = groupByPerson([
			item({ ownerId: 'alice', ownerName: 'Alice', ownerEmail: 'alice@x', ownerPartnerId: 'bob', cost: 40 }),
			item({ ownerId: 'bob', ownerName: 'Bob', ownerEmail: 'bob@x', ownerPartnerId: 'alice', cost: 60 }),
		])
		expect(groups).toHaveLength(1)
		expect(groups[0]).toMatchObject({
			key: 'alice',
			name: 'Alice',
			partnerName: 'Bob',
			totalSpent: 100,
		})
	})

	it('keeps partnered recipients separate if only one appears', () => {
		// Alice has a partner but Bob isn't in the list. We shouldn't invent
		// a partnerName from a partnerId that doesn't have any items.
		const groups = groupByPerson([
			item({ ownerId: 'alice', ownerName: 'Alice', ownerEmail: 'alice@x', ownerPartnerId: 'bob', cost: 40 }),
		])
		expect(groups).toHaveLength(1)
		expect(groups[0].partnerName).toBeNull()
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
		const groups = groupByPerson([
			item({ ownerId: 'alice', ownerName: null, ownerEmail: 'alice@example.com', cost: 10 }),
		])
		expect(groups[0].name).toBe('alice@example.com')
	})
})
