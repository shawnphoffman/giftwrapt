// List-addon (off-list gift) permissions matrix.
//
// Surfaces to cover when populated:
//   - createListAddonImpl      (gifter-only; cannot addon to own list)
//   - updateListAddonImpl      (author-only)
//   - archiveListAddonImpl     (author-only; gifter-facing UI was removed
//                               2026-04-21, so this path may be retired)
//   - deleteListAddonImpl      (author-only, hard-delete)
//
// Per logic.md, addons are recipient-driven for fulfilment — do NOT
// re-introduce a gifter-facing "mark as given" surface. If a future
// rule lands here, it should still be triggered by the recipient flow.

import { describe, expect, it } from 'vitest'

import { listAddonExpectations } from './_expectations'

describe('list-addon permissions × matrix', () => {
	it.skipIf(listAddonExpectations.length === 0)('matrix is populated', () => {
		expect(listAddonExpectations.length).toBeGreaterThan(0)
	})

	if (listAddonExpectations.length === 0) {
		it.todo('populate listAddonExpectations and replace with it.each')
	}
})
