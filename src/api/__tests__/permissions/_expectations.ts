// Central permutation table for the permissions integration suite.
//
// Each per-resource test file imports its slice from here and runs
// `it.each` over the rows. Adding a rule = adding a row. Adding a new
// `Role` or `ListState` widens the matrix; the duplicate-key validator
// (`assertNoDuplicateExpectations`) catches contradictions at module
// load.
//
// The expectations recorded here are the **today** behaviour of the
// canonical permission helpers (`canViewList`, `canEditList`) plus
// any inline checks already enforced in the impls. When `.notes/logic.md`
// adds a new rule, the table here must change to match. That's the
// load-bearing assertion the suite exists to make.

import {
	ALL_LIST_STATES,
	ALL_ROLES,
	assertNoDuplicateExpectations,
	type Expectation,
	type ListState,
	type Role,
} from '@/lib/__tests__/permissions/_matrix-types'

// ---------------------------------------------------------------------------
// canViewList expectations
// ---------------------------------------------------------------------------
// The helper is owner-blind by contract (the doc-comment on permissions.ts
// says callers must check ownership separately). It returns:
//   - deny('inactive') when the list is inactive
//   - deny('private') when the list is private (regardless of role)
//   - deny('denied')  when the viewer is in userRelationships with canView=false
//   - allow           otherwise
//
// Guardian and partner roles do NOT get implicit view access through this
// helper. Guardians reach private lists via `canEditList` (which subsumes
// view in the edit flow) and partners are limited to public lists by
// design (logic.md notes a possible future change there).
// ---------------------------------------------------------------------------

const canViewListExpectations: ReadonlyArray<Expectation<'view-via-canViewList'>> = ALL_ROLES.flatMap(role =>
	ALL_LIST_STATES.map<Expectation<'view-via-canViewList'>>(listState => {
		// Owner is intentionally not handled by canViewList. The contract
		// requires callers to short-circuit on `list.ownerId === viewerId`
		// themselves. Capture today's behaviour: helper denies on the
		// listState filters even when called with the owner's own id.
		// Restricted viewers also pass canViewList - the filtering happens
		// at the item level, not the list level.
		const expected: 'allow' | 'deny' = (() => {
			if (!listState.active) return 'deny'
			if (listState.privacy === 'private' || listState.privacy === 'gift-ideas') return 'deny'
			if (role === 'denied') return 'deny'
			return 'allow'
		})()

		const reasonOnDeny = (() => {
			if (expected === 'allow') return undefined
			if (!listState.active) return 'inactive'
			if (listState.privacy !== 'public') return 'private'
			return 'denied'
		})()

		return { role, listState, action: 'view-via-canViewList', expected, reasonOnDeny }
	})
)

// ---------------------------------------------------------------------------
// canViewListAsAnyone expectations
// ---------------------------------------------------------------------------
// Same as canViewList except the owner short-circuit returns allow on
// every list state (including inactive / private / gift-ideas). Useful
// for surfaces that show data to either the owner or a permitted viewer.
// ---------------------------------------------------------------------------

const canViewListAsAnyoneExpectations: ReadonlyArray<Expectation<'view-via-canViewListAsAnyone'>> = ALL_ROLES.flatMap(role =>
	ALL_LIST_STATES.map<Expectation<'view-via-canViewListAsAnyone'>>(listState => {
		if (role === 'owner') {
			return { role, listState, action: 'view-via-canViewListAsAnyone', expected: 'allow' }
		}
		// Non-owners delegate to canViewList. Mirror the table above.
		const expected: 'allow' | 'deny' = (() => {
			if (!listState.active) return 'deny'
			if (listState.privacy === 'private' || listState.privacy === 'gift-ideas') return 'deny'
			if (role === 'denied') return 'deny'
			return 'allow'
		})()

		return { role, listState, action: 'view-via-canViewListAsAnyone', expected }
	})
)

// ---------------------------------------------------------------------------
// canEditList expectations
// ---------------------------------------------------------------------------
// `canEditList` is intentionally NOT owner-aware (callers check ownership
// themselves; see permissions.ts doc). It allows when ANY of:
//   - guardianship parent of the owner
//   - userRelationships.canEdit = true
//   - listEditors row for (listId, userId)
// and otherwise denies with reason 'not-editor'.
//
// list state (active/private/gift-ideas) does NOT factor into the
// edit-grant decision today; even an inactive list is editable for a
// guardian or explicit editor. This captures that.
// ---------------------------------------------------------------------------

function editAllowedFor(role: Role): boolean {
	switch (role) {
		case 'guardian':
		case 'list-editor':
		case 'user-edit':
			return true
		// Owner is not handled by canEditList per contract; for the matrix
		// we record what the helper actually returns. Owners in the seeded
		// fixtures don't have a guardian/editor row, so the helper denies.
		case 'owner':
		case 'partner':
		case 'denied':
		case 'restricted':
		case 'default':
		case 'child-role':
			return false
	}
}

// Restricted viewers get a distinct deny reason ('restricted'), separate
// from the default 'not-editor'. Capture that asymmetry so a future change
// that drops the restricted-wins suppression fails this test.
function editDenyReasonFor(role: Role): 'not-editor' | 'restricted' {
	return role === 'restricted' ? 'restricted' : 'not-editor'
}

const canEditListExpectations: ReadonlyArray<Expectation<'edit-via-canEditList'>> = ALL_ROLES.flatMap(role =>
	ALL_LIST_STATES.map<Expectation<'edit-via-canEditList'>>(listState => {
		const expected: 'allow' | 'deny' = editAllowedFor(role) ? 'allow' : 'deny'
		return {
			role,
			listState,
			action: 'edit-via-canEditList',
			expected,
			reasonOnDeny: expected === 'deny' ? editDenyReasonFor(role) : undefined,
		}
	})
)

// ---------------------------------------------------------------------------
// Composed list table.
// ---------------------------------------------------------------------------

export const listExpectations = [...canViewListExpectations, ...canViewListAsAnyoneExpectations, ...canEditListExpectations] as const

assertNoDuplicateExpectations(listExpectations)

// ---------------------------------------------------------------------------
// Resource-specific tables: stubs for now. The corresponding test files
// import these and currently iterate an empty array. As `.notes/logic.md`
// expands, populate these and the existing test files start asserting
// without further wiring.
// ---------------------------------------------------------------------------

export const itemExpectations: ReadonlyArray<Expectation> = []
export const claimExpectations: ReadonlyArray<Expectation> = []
export const commentExpectations: ReadonlyArray<Expectation> = []
export const listEditorExpectations: ReadonlyArray<Expectation> = []
export const listAddonExpectations: ReadonlyArray<Expectation> = []
export const relationshipExpectations: ReadonlyArray<Expectation> = []

// Re-export for the integration test files so they don't need to import
// from two locations.
export type { Expectation, ListState, Role }
export { ALL_LIST_STATES, ALL_ROLES }
