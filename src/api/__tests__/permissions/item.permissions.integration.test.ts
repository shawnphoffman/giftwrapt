// Item-level permissions matrix.
//
// Surfaces to cover when populated:
//   - getItemsForListViewImpl  (visibility-gated)
//   - getItemsForListEditImpl  (edit-gated)
//   - createItemImpl           (edit-gated; child role × gift-ideas list interaction TBD)
//   - updateItemImpl
//   - archiveItemImpl
//   - deleteItemsImpl          (hard-delete on unclaimed; archive on claimed — see logic.md)
//   - copyItemToListImpl       (cross-list edit gating)
//
// Add expectation rows to `itemExpectations` in `_expectations.ts` and
// extend `_seeds.ts` with an item-bearing scenario when ready.

import { describe, expect, it } from 'vitest'

import { itemExpectations } from './_expectations'

describe('item permissions × matrix', () => {
	it.skipIf(itemExpectations.length === 0)('matrix is populated', () => {
		expect(itemExpectations.length).toBeGreaterThan(0)
	})

	if (itemExpectations.length === 0) {
		// Stub placeholder so the file shows up in test discovery without
		// failing. Remove this once the matrix is populated.
		it.todo('populate itemExpectations and replace with it.each')
	}
})
