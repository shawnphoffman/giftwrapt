import { describe, expect, it } from 'vitest'

import {
	type ClaimRecord,
	filterItemsForRestricted,
	type GroupForRestrictedFilter,
	isInsiderClaim,
	type ItemForRestrictedFilter,
} from '../restricted-filter'

const VIEWER = 'user_viewer'
const PARTNER = 'user_partner'
const STRANGER = 'user_stranger'
const STRANGER_2 = 'user_stranger_2'

function claim(overrides: Partial<ClaimRecord> & { gifterId: string }): ClaimRecord {
	return {
		gifterId: overrides.gifterId,
		additionalGifterIds: overrides.additionalGifterIds ?? null,
		quantity: overrides.quantity ?? 1,
	}
}

function item(id: number, overrides: Partial<ItemForRestrictedFilter> = {}): ItemForRestrictedFilter {
	return {
		id,
		quantity: overrides.quantity ?? 1,
		groupId: overrides.groupId ?? null,
		groupSortOrder: overrides.groupSortOrder ?? null,
		gifts: overrides.gifts ?? [],
	}
}

describe('isInsiderClaim', () => {
	const insiders = new Set([VIEWER, PARTNER])

	it('treats a primary gifter that is the viewer as an insider', () => {
		expect(isInsiderClaim(claim({ gifterId: VIEWER }), insiders)).toBe(true)
	})
	it('treats a primary gifter that is the partner as an insider', () => {
		expect(isInsiderClaim(claim({ gifterId: PARTNER }), insiders)).toBe(true)
	})
	it('treats a stranger primary gifter with insider co-gifter as insider', () => {
		expect(isInsiderClaim(claim({ gifterId: STRANGER, additionalGifterIds: [PARTNER] }), insiders)).toBe(true)
	})
	it('treats a fully-stranger claim as outsider', () => {
		expect(isInsiderClaim(claim({ gifterId: STRANGER, additionalGifterIds: [STRANGER_2] }), insiders)).toBe(false)
	})
})

describe('filterItemsForRestricted', () => {
	const noGroups: Array<GroupForRestrictedFilter> = []

	it('shows items with zero claims', () => {
		const out = filterItemsForRestricted([item(1)], noGroups, VIEWER, PARTNER)
		expect(out).toHaveLength(1)
		expect(out[0].id).toBe(1)
	})

	it('shows items with only viewer claims', () => {
		const out = filterItemsForRestricted([item(1, { gifts: [claim({ gifterId: VIEWER })] })], noGroups, VIEWER, PARTNER)
		expect(out).toHaveLength(1)
		expect(out[0].gifts).toHaveLength(1)
	})

	it('shows items with only partner claims when partnerId is set', () => {
		const out = filterItemsForRestricted([item(1, { gifts: [claim({ gifterId: PARTNER })] })], noGroups, VIEWER, PARTNER)
		expect(out).toHaveLength(1)
	})

	it('hides items where every claim is by an outsider', () => {
		const out = filterItemsForRestricted([item(1, { gifts: [claim({ gifterId: STRANGER })] })], noGroups, VIEWER, PARTNER)
		expect(out).toHaveLength(0)
	})

	it('shows items with mixed insider/outsider claims and strips the outsider records', () => {
		const out = filterItemsForRestricted(
			[item(1, { quantity: 3, gifts: [claim({ gifterId: VIEWER, quantity: 1 }), claim({ gifterId: STRANGER, quantity: 1 })] })],
			noGroups,
			VIEWER,
			PARTNER
		)
		expect(out).toHaveLength(1)
		expect(out[0].gifts).toHaveLength(1)
		expect(out[0].gifts[0].gifterId).toBe(VIEWER)
	})

	it('strips outsider co-gifters from a surviving claim', () => {
		const out = filterItemsForRestricted(
			[item(1, { gifts: [claim({ gifterId: VIEWER, additionalGifterIds: [STRANGER, PARTNER] })] })],
			noGroups,
			VIEWER,
			PARTNER
		)
		expect(out[0].gifts[0].additionalGifterIds).toEqual([PARTNER])
	})

	it('treats a stranger primary with viewer as co-gifter as visible', () => {
		const out = filterItemsForRestricted(
			[item(1, { gifts: [claim({ gifterId: STRANGER, additionalGifterIds: [VIEWER] })] })],
			noGroups,
			VIEWER,
			PARTNER
		)
		// The item is visible because the viewer is a co-gifter, but the
		// primary gifter is a stranger so the claim itself stays in the array
		// (it's "their own" claim).
		expect(out).toHaveLength(1)
		expect(out[0].gifts).toHaveLength(1)
	})

	it('handles partial-quantity items: visible when partially insider-claimed', () => {
		const items = [item(1, { quantity: 3, gifts: [claim({ gifterId: VIEWER, quantity: 1 })] })]
		const out = filterItemsForRestricted(items, noGroups, VIEWER, null)
		expect(out).toHaveLength(1)
	})

	it('hides every sibling in an OR group once any item has an outsider claim', () => {
		const groups: Array<GroupForRestrictedFilter> = [{ id: 100, type: 'or' }]
		const items = [item(1, { groupId: 100, gifts: [claim({ gifterId: STRANGER })] }), item(2, { groupId: 100 }), item(3, { groupId: 100 })]
		const out = filterItemsForRestricted(items, groups, VIEWER, PARTNER)
		expect(out).toHaveLength(0)
	})

	it('keeps OR-group siblings visible when no outsider claims exist', () => {
		const groups: Array<GroupForRestrictedFilter> = [{ id: 100, type: 'or' }]
		const items = [item(1, { groupId: 100, gifts: [claim({ gifterId: VIEWER })] }), item(2, { groupId: 100 })]
		const out = filterItemsForRestricted(items, groups, VIEWER, PARTNER)
		expect(out.map(i => i.id).sort()).toEqual([1, 2])
	})

	it('hides ORDER-group items past the first unfulfilled position regardless of who claimed', () => {
		const groups: Array<GroupForRestrictedFilter> = [{ id: 200, type: 'order' }]
		const items = [
			// item 1 fully claimed by viewer
			item(1, { quantity: 1, groupId: 200, groupSortOrder: 0, gifts: [claim({ gifterId: VIEWER })] }),
			// item 2 unclaimed - this is the gate
			item(2, { quantity: 1, groupId: 200, groupSortOrder: 1 }),
			// item 3 should be hidden (still gated by item 2)
			item(3, { quantity: 1, groupId: 200, groupSortOrder: 2 }),
		]
		const out = filterItemsForRestricted(items, groups, VIEWER, PARTNER)
		expect(out.map(i => i.id).sort()).toEqual([1, 2])
	})

	it('all-stranger claims drop entirely', () => {
		const out = filterItemsForRestricted(
			[item(1, { gifts: [claim({ gifterId: STRANGER }), claim({ gifterId: STRANGER_2 })] })],
			noGroups,
			VIEWER,
			PARTNER
		)
		expect(out).toHaveLength(0)
	})

	it('does not pull a partner-claim into visibility when partnerId is null', () => {
		const out = filterItemsForRestricted([item(1, { gifts: [claim({ gifterId: PARTNER })] })], noGroups, VIEWER, null)
		expect(out).toHaveLength(0)
	})
})
