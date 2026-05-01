// Item comment permissions matrix.
//
// Surfaces to cover when populated:
//   - getCommentsForItemImpl   (gated by canViewListAsAnyone for the parent list)
//   - createItemCommentImpl    (visibility-gated; rate-limited at the route layer)
//   - updateItemCommentImpl    (author-only)
//   - deleteItemCommentImpl    (author OR list owner)
//
// The "list owner can delete any comment on their own list" path is the
// most subtle rule here — make sure to cover both author-different-from-owner
// and author-is-owner cases when populating.

import { describe, expect, it } from 'vitest'

import { commentExpectations } from './_expectations'

describe('comment permissions × matrix', () => {
	it.skipIf(commentExpectations.length === 0)('matrix is populated', () => {
		expect(commentExpectations.length).toBeGreaterThan(0)
	})

	if (commentExpectations.length === 0) {
		it.todo('populate commentExpectations and replace with it.each')
	}
})
