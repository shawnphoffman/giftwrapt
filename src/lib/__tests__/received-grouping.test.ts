import { describe, expect, it } from 'vitest'

import type { GifterUnit, ReceivedAddonRow, ReceivedGiftRow } from '@/api/received'

import { groupByGifterUnit } from '../received-grouping'

function unit(key: string, label: string, members: GifterUnit['members']): GifterUnit {
	return { key, label, members }
}

function gift(overrides: Partial<ReceivedGiftRow> = {}): ReceivedGiftRow {
	return {
		type: 'item',
		itemId: 1,
		itemTitle: 'A thing',
		itemImageUrl: null,
		itemPrice: null,
		listId: 1,
		listName: 'Wishlist',
		gifterNames: [],
		gifterUnits: [],
		quantity: 1,
		archivedAt: new Date('2026-01-15'),
		createdAt: new Date('2026-01-15'),
		recipientKind: 'self',
		recipientId: 'viewer',
		...overrides,
	}
}

function addon(overrides: Partial<ReceivedAddonRow> = {}): ReceivedAddonRow {
	return {
		type: 'addon',
		addonId: 1,
		description: 'A side gift',
		totalCost: null,
		listId: 1,
		listName: 'Wishlist',
		gifterNames: [],
		gifterUnits: [],
		archivedAt: new Date('2026-01-15'),
		createdAt: new Date('2026-01-15'),
		recipientKind: 'self',
		recipientId: 'viewer',
		...overrides,
	}
}

describe('groupByGifterUnit', () => {
	it('returns an empty array for no rows', () => {
		expect(groupByGifterUnit([])).toEqual([])
	})

	it('groups rows by unit key and counts gifts vs addons', () => {
		const alice = unit('solo:alice', 'Alice', [{ id: 'alice', name: 'Alice', image: null }])
		const groups = groupByGifterUnit([
			gift({ gifterUnits: [alice] }),
			gift({ itemId: 2, gifterUnits: [alice] }),
			addon({ addonId: 1, gifterUnits: [alice] }),
		])
		expect(groups).toHaveLength(1)
		expect(groups[0]).toMatchObject({ key: 'solo:alice', label: 'Alice', giftCount: 2, addonCount: 1, totalCount: 3 })
	})

	it('collapses two co-gifters from the same household into one unit', () => {
		// Same pair-key delivered by both gifter ids -> single group.
		const pair = unit('pair:alice:bob', 'Alice & Bob', [
			{ id: 'alice', name: 'Alice', image: null },
			{ id: 'bob', name: 'Bob', image: null },
		])
		const groups = groupByGifterUnit([gift({ gifterUnits: [pair] })])
		expect(groups).toHaveLength(1)
		expect(groups[0].label).toBe('Alice & Bob')
		expect(groups[0].totalCount).toBe(1)
	})

	it('counts a row in every credited unit when co-gifters span households', () => {
		const aliceBob = unit('pair:alice:bob', 'Alice & Bob', [
			{ id: 'alice', name: 'Alice', image: null },
			{ id: 'bob', name: 'Bob', image: null },
		])
		const carol = unit('solo:carol', 'Carol', [{ id: 'carol', name: 'Carol', image: null }])
		const groups = groupByGifterUnit([gift({ gifterUnits: [aliceBob, carol] })])
		expect(groups).toHaveLength(2)
		expect(groups.find(g => g.key === 'pair:alice:bob')?.totalCount).toBe(1)
		expect(groups.find(g => g.key === 'solo:carol')?.totalCount).toBe(1)
	})

	it('sorts groups by totalCount descending', () => {
		const a = unit('solo:a', 'A', [{ id: 'a', name: 'A', image: null }])
		const b = unit('solo:b', 'B', [{ id: 'b', name: 'B', image: null }])
		const c = unit('solo:c', 'C', [{ id: 'c', name: 'C', image: null }])
		const groups = groupByGifterUnit([
			gift({ gifterUnits: [a] }),
			gift({ itemId: 2, gifterUnits: [b] }),
			gift({ itemId: 3, gifterUnits: [b] }),
			gift({ itemId: 4, gifterUnits: [c] }),
			gift({ itemId: 5, gifterUnits: [c] }),
			gift({ itemId: 6, gifterUnits: [c] }),
		])
		expect(groups.map(g => g.label)).toEqual(['C', 'B', 'A'])
	})

	it("treats viewer's own partner as a solo unit (not paired with viewer)", () => {
		// Simulates the API decision: when the gifter IS the viewer's partner,
		// the API emits a solo unit for them. The grouping helper just respects
		// what the API set.
		const viewerPartnerSolo = unit('solo:diana', 'Diana', [{ id: 'diana', name: 'Diana', image: null }])
		const groups = groupByGifterUnit([gift({ gifterUnits: [viewerPartnerSolo] })])
		expect(groups).toHaveLength(1)
		expect(groups[0].key).toBe('solo:diana')
		expect(groups[0].members).toHaveLength(1)
	})
})
