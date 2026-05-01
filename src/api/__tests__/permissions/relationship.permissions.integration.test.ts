// User-relationship permissions matrix.
//
// Surfaces to cover when populated:
//   - getUsersWithRelationshipsImpl
//   - getOwnersWithRelationshipsForMeImpl
//   - upsertUserRelationshipsImpl     (owner-perspective: sets canView/canEdit)
//   - upsertViewerRelationshipsImpl   (viewer-perspective: sets only canView,
//                                      cannot grant self canEdit)
//
// The viewer-perspective upsert's inability to self-grant canEdit is a
// load-bearing invariant — it's what stops a viewer from elevating their
// own access. Make sure that asymmetry is locked in when populating.

import { describe, expect, it } from 'vitest'

import { relationshipExpectations } from './_expectations'

describe('relationship permissions × matrix', () => {
	it.skipIf(relationshipExpectations.length === 0)('matrix is populated', () => {
		expect(relationshipExpectations.length).toBeGreaterThan(0)
	})

	if (relationshipExpectations.length === 0) {
		it.todo('populate relationshipExpectations and replace with it.each')
	}
})
