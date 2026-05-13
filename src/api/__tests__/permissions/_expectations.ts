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
	type Action,
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
// Shared helpers for the resource-specific tables below.
// ---------------------------------------------------------------------------
// The resource-level expectations follow two reusable patterns:
//
//   1. View-gated: outcome mirrors canViewList for non-owners, plus an
//      action-specific override for the owner row. Used by item/claim/
//      comment/addon read paths.
//   2. Edit-gated: outcome mirrors canEditList, plus an owner short-
//      circuit to allow. Used by item create/update/archive/delete.
//
// Capturing them as named helpers keeps each resource table readable and
// makes the per-impl exceptions obvious (e.g. "create-addon denies the
// owner; everything else is a view-gate clone").

type ViewGatedOptions = {
	action: Exclude<Action, 'edit-via-canEditList' | 'view-via-canViewList' | 'view-via-canViewListAsAnyone'>
	// Owner behaves differently than canViewList for most resources:
	// view-item denies with 'is-owner' (guards a gifter-only surface);
	// create-addon denies with 'cannot-add-to-own-list'; claim-item denies
	// with 'cannot-claim-own-list'; comments use canViewListAsAnyone so
	// the owner always allows.
	ownerExpected: 'allow' | 'deny'
	ownerDenyReason?: string
	// Reason the impl reports when canViewList denies (mostly 'not-visible').
	viewDeniedReason: string
}

function viewGatedExpectations(opts: ViewGatedOptions): ReadonlyArray<Expectation> {
	const { action, ownerExpected, ownerDenyReason, viewDeniedReason } = opts
	return ALL_ROLES.flatMap(role =>
		ALL_LIST_STATES.map<Expectation>(listState => {
			if (role === 'owner') {
				return {
					role,
					listState,
					action,
					expected: ownerExpected,
					reasonOnDeny: ownerExpected === 'deny' ? ownerDenyReason : undefined,
				}
			}
			// canViewList denies on inactive, private, gift-ideas, or denied.
			// Every role except owner sits behind that gate; guardian/partner/
			// list-editor/user-edit/restricted don't override it (logic.md:
			// canViewList is owner-blind and ignores guardianship and the
			// edit-grant tables).
			const denies = !listState.active || listState.privacy !== 'public' || role === 'denied'
			return {
				role,
				listState,
				action,
				expected: denies ? 'deny' : 'allow',
				reasonOnDeny: denies ? viewDeniedReason : undefined,
			}
		})
	)
}

type EditGatedOptions = {
	action: Exclude<Action, 'edit-via-canEditList' | 'view-via-canViewList' | 'view-via-canViewListAsAnyone'>
	// Reason the impl reports when canEditList denies. Most impls collapse
	// the helper's 'not-editor' + 'restricted' into a single 'not-authorized'
	// at the wrapper layer; record that here so the test asserts the
	// impl-level reason, not the helper's.
	denyReason: string
}

function editGatedExpectations(opts: EditGatedOptions): ReadonlyArray<Expectation> {
	const { action, denyReason } = opts
	return ALL_ROLES.flatMap(role =>
		ALL_LIST_STATES.map<Expectation>(listState => {
			// Owner always edits their own list, regardless of list state.
			if (role === 'owner') return { role, listState, action, expected: 'allow' }
			const allowed = editAllowedFor(role)
			return {
				role,
				listState,
				action,
				expected: allowed ? 'allow' : 'deny',
				reasonOnDeny: allowed ? undefined : denyReason,
			}
		})
	)
}

// ---------------------------------------------------------------------------
// itemExpectations
// ---------------------------------------------------------------------------
// - view-item: getItemsForListViewImpl is the gifter-only surface.
//   The owner short-circuits with 'is-owner' (the impl explicitly rejects
//   the recipient from their own gifter view). Everyone else runs
//   through canViewList; deny reason rolls up to 'not-visible'.
// - create/update/archive/delete-item: every write path calls
//   assertCanEditItems, which is canEditList plus an owner short-circuit.
//   The impl flattens the helper's 'restricted' / 'not-editor' reasons
//   into a single 'not-authorized'.
// ---------------------------------------------------------------------------

export const itemExpectations: ReadonlyArray<Expectation> = [
	...viewGatedExpectations({
		action: 'view-item',
		ownerExpected: 'deny',
		ownerDenyReason: 'is-owner',
		viewDeniedReason: 'not-visible',
	}),
	...editGatedExpectations({ action: 'create-item', denyReason: 'not-authorized' }),
	...editGatedExpectations({ action: 'update-item', denyReason: 'not-authorized' }),
	...editGatedExpectations({ action: 'archive-item', denyReason: 'not-authorized' }),
	...editGatedExpectations({ action: 'delete-item', denyReason: 'not-authorized' }),
] as const

assertNoDuplicateExpectations(itemExpectations)

// ---------------------------------------------------------------------------
// claimExpectations
// ---------------------------------------------------------------------------
// - claim-item: the owner can never claim on their own list
//   ('cannot-claim-own-list'). Every other role uses canViewList; deny
//   rolls up to 'not-visible'. The restricted role passes (canViewList
//   ok) and can claim; the no-leak guarantee is enforced at the item-
//   filter layer, which is covered by restricted.permissions tests.
//
// unclaim-item and add-co-gifter aren't matrix-shaped: their gates are
// row-ownership ("did YOU make this claim?"), not role x listState. The
// integration test file holds standalone cases for those.
// ---------------------------------------------------------------------------

export const claimExpectations: ReadonlyArray<Expectation> = [
	...viewGatedExpectations({
		action: 'claim-item',
		ownerExpected: 'deny',
		ownerDenyReason: 'cannot-claim-own-list',
		viewDeniedReason: 'not-visible',
	}),
] as const

assertNoDuplicateExpectations(claimExpectations)

// ---------------------------------------------------------------------------
// commentExpectations
// ---------------------------------------------------------------------------
// - view-comments and create-comment both gate through canViewListAsAnyone,
//   which short-circuits to allow for the owner and otherwise mirrors
//   canViewList. view-comments returns [] on deny (rather than an error
//   object); the test file treats "empty array" as the deny signal.
//
// update-comment (author-only) and delete-comment (author OR list owner)
// don't fit the role x listState matrix. The integration test file holds
// standalone cases for both.
// ---------------------------------------------------------------------------

export const commentExpectations: ReadonlyArray<Expectation> = [
	...viewGatedExpectations({
		action: 'view-comments',
		ownerExpected: 'allow',
		viewDeniedReason: 'not-visible',
	}),
	...viewGatedExpectations({
		action: 'create-comment',
		ownerExpected: 'allow',
		viewDeniedReason: 'not-visible',
	}),
] as const

assertNoDuplicateExpectations(commentExpectations)

// ---------------------------------------------------------------------------
// listEditorExpectations
// ---------------------------------------------------------------------------
// - add-list-editor: actor is ALWAYS the owner; the matrix row's `role`
//   describes the proposed target. Outcomes:
//     * owner role -> the owner trying to add themselves: 'cannot-add-self'
//     * list-editor role -> target is already an editor: 'already-editor'
//     * restricted role -> 'user-is-restricted' (restricted-wins)
//     * child-role -> 'user-is-child'
//     * everyone else -> allow
//   List state is not consulted; the impl only checks list existence.
//
// remove-list-editor is gated by ownership of the editor row, not by
// the matrix's role table. The integration test file holds those cases.
// ---------------------------------------------------------------------------

function addEditorOutcomeFor(role: Role): { expected: 'allow' | 'deny'; reasonOnDeny?: string } {
	switch (role) {
		case 'owner':
			return { expected: 'deny', reasonOnDeny: 'cannot-add-self' }
		case 'list-editor':
			return { expected: 'deny', reasonOnDeny: 'already-editor' }
		case 'restricted':
			return { expected: 'deny', reasonOnDeny: 'user-is-restricted' }
		case 'child-role':
			return { expected: 'deny', reasonOnDeny: 'user-is-child' }
		// guardian, partner, user-edit, denied, default: no gate trips, allow.
		// Note: a 'denied' user is excluded from getAddableEditorsImpl's
		// picker, but addListEditorImpl itself does not reject them. Capture
		// that today-behavior so a future tightening here surfaces.
		case 'guardian':
		case 'partner':
		case 'user-edit':
		case 'denied':
		case 'default':
			return { expected: 'allow' }
	}
}

export const listEditorExpectations: ReadonlyArray<Expectation> = ALL_ROLES.flatMap(role =>
	ALL_LIST_STATES.map<Expectation>(listState => ({
		role,
		listState,
		action: 'add-list-editor',
		...addEditorOutcomeFor(role),
	}))
)

assertNoDuplicateExpectations(listEditorExpectations)

// ---------------------------------------------------------------------------
// listAddonExpectations
// ---------------------------------------------------------------------------
// - create-addon: gifter-volunteered extras. Owner can NOT addon to their
//   own list ('cannot-add-to-own-list'); everyone else uses canViewList.
//   Restricted viewers CAN create addons (logic.md: restricted viewers
//   still see their own addons and may create new ones).
//
// update-addon / archive-addon / delete-addon are author-row-ownership
// gates. The integration test file holds standalone cases for those.
// ---------------------------------------------------------------------------

export const listAddonExpectations: ReadonlyArray<Expectation> = [
	...viewGatedExpectations({
		action: 'create-addon',
		ownerExpected: 'deny',
		ownerDenyReason: 'cannot-add-to-own-list',
		viewDeniedReason: 'not-visible',
	}),
] as const

assertNoDuplicateExpectations(listAddonExpectations)

// ---------------------------------------------------------------------------
// relationshipExpectations
// ---------------------------------------------------------------------------
// upsertUserRelationships and upsertViewerRelationships don't fit the
// role x listState matrix: there's no list involved, and the load-bearing
// rule is "partners and guardian-paired users cannot be restricted",
// which is about the relationship structure, not the list state.
//
// We populate a single per-role row (action: 'upsert-as-owner') so the
// matrix coverage assertion has something to count. The actual contract
// tests for the restricted-not-allowed reject live in the integration
// file as standalone scenarios.
// ---------------------------------------------------------------------------

// One row per role so the test file can iterate; outcome encodes "can
// the owner set this role's viewer to accessLevel='restricted'?".
// Guardian and partner are the two rows where the upsert MUST reject;
// every other role accepts the write.
function canBeRestrictedFor(role: Role): boolean {
	switch (role) {
		case 'guardian':
		case 'partner':
			return false
		case 'owner': // self-upsert is filtered upstream; the impl would still write
		case 'list-editor':
		case 'user-edit':
		case 'denied':
		case 'restricted':
		case 'default':
		case 'child-role':
			return true
	}
}

// listState doesn't apply; pick a representative cell so the matrix's
// duplicate-key validator stays happy. The (role, listState, action)
// tuple is still unique because we use only one listState per role.
const SENTINEL_LIST_STATE: ListState = { privacy: 'public', active: true }

export const relationshipExpectations: ReadonlyArray<Expectation> = ALL_ROLES.map<Expectation>(role => {
	const allowed = canBeRestrictedFor(role)
	return {
		role,
		listState: SENTINEL_LIST_STATE,
		action: 'upsert-as-owner',
		expected: allowed ? 'allow' : 'deny',
		reasonOnDeny: allowed ? undefined : 'restricted-not-allowed',
	}
})

assertNoDuplicateExpectations(relationshipExpectations)

// Re-export for the integration test files so they don't need to import
// from two locations.
export type { Expectation, ListState, Role }
export { ALL_LIST_STATES, ALL_ROLES }
