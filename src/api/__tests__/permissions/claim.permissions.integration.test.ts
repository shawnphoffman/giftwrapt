// Claim (giftedItem) permissions matrix.
//
// Surfaces to cover when populated:
//   - claimItemGiftImpl
//     * cannot claim own list (currently checked at impl layer, _gifts-impl.ts:74)
//     * over-claim guard (returns 'over-claim' with `remaining`)
//     * 'or' group: only one claim allowed across the group
//     * 'sequence' group: must claim in order
//     * visibility gate via canViewList (denies private)
//   - unclaimItemGiftImpl
//     * hard-delete only; no isArchived column on giftedItems (logic.md §3)
//   - updateItemGiftImpl
//     * quantity edit honors over-claim cap
//   - updateCoGiftersImpl
//     * replace-not-append semantics
//     * partner-of-claimer credit propagation (purchases.ts predicate)
//
// The partner-aware credit predicate
// (`gifterId IN [me, partner] OR additionalGifterIds && [me, partner]`)
// is the most important rule to lock down here. It's the canonical
// source of "who gifted this" and silently under-counts when wrong.

import { describe, expect, it } from 'vitest'

import { claimExpectations } from './_expectations'

describe('claim permissions × matrix', () => {
	it.skipIf(claimExpectations.length === 0)('matrix is populated', () => {
		expect(claimExpectations.length).toBeGreaterThan(0)
	})

	if (claimExpectations.length === 0) {
		it.todo('populate claimExpectations and replace with it.each')
	}
})
