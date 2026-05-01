// Shared types for the permissions matrix. Both the unit-level helper
// tests (this directory) and the integration-level impl tests
// (`src/api/__tests__/permissions/`) reference these so adding a new
// role / resource / action only requires touching one file.

/**
 * The eight actor types the system distinguishes today. Captured from
 * `.notes/logic.md` and the inline checks in `src/lib/permissions.ts`,
 * `src/api/_lists-impl.ts`, and friends.
 *
 * - `owner`: the list owner themselves.
 * - `guardian`: the viewer is a parent in `guardianships` and the list owner is the child.
 * - `partner`: the viewer is set as `users.partnerId` (bidirectionally) of the list owner.
 *   Logical access depends on list privacy: public is granted by default, private requires an explicit editor row.
 * - `list-editor`: the viewer has a row in `listEditors` for the specific list.
 * - `user-edit`: the viewer has `userRelationships.canEdit = true` for the owner (blanket grant).
 * - `denied`: the viewer has `userRelationships.canView = false` for the owner.
 * - `default`: no relationship row exists; the system default ("yes for public, no for private") applies.
 * - `child-role`: the viewer's `users.role = 'child'`. Mostly affects what they can CREATE, not view.
 */
export type Role = 'owner' | 'guardian' | 'partner' | 'list-editor' | 'user-edit' | 'denied' | 'default' | 'child-role'

export const ALL_ROLES: ReadonlyArray<Role> = [
	'owner',
	'guardian',
	'partner',
	'list-editor',
	'user-edit',
	'denied',
	'default',
	'child-role',
]

/**
 * The state of the resource being acted on. Today only list state is
 * captured at the helper level. Item / claim / comment-specific states
 * live in their own resource-specific expectation tables.
 */
export type ListState = {
	privacy: 'public' | 'private' | 'gift-ideas'
	active: boolean
}

export const ALL_LIST_STATES: ReadonlyArray<ListState> = [
	{ privacy: 'public', active: true },
	{ privacy: 'public', active: false },
	{ privacy: 'private', active: true },
	{ privacy: 'private', active: false },
	{ privacy: 'gift-ideas', active: true },
	{ privacy: 'gift-ideas', active: false },
]

/**
 * Cross-resource action verbs. Resource-specific tables narrow the union
 * to the actions actually applicable to that resource.
 */
export type Action =
	// list actions
	| 'view-via-canViewList'
	| 'view-via-canViewListAsAnyone'
	| 'edit-via-canEditList'
	| 'set-primary'
	| 'archive-list'
	| 'delete-list'
	// item actions
	| 'view-item'
	| 'create-item'
	| 'update-item'
	| 'archive-item'
	| 'delete-item'
	// claim actions
	| 'claim-item'
	| 'unclaim-item'
	| 'add-co-gifter'
	// comment actions
	| 'view-comments'
	| 'create-comment'
	| 'update-comment'
	| 'delete-comment'
	// list-editor management
	| 'add-list-editor'
	| 'remove-list-editor'
	// list-addon
	| 'create-addon'
	| 'update-addon'
	| 'archive-addon'
	| 'delete-addon'
	// relationship
	| 'upsert-as-owner'
	| 'upsert-as-viewer'

/**
 * The contract every expectation row honors. `expected` is the only
 * load-bearing assertion; `reasonOnDeny` is informational and shows up in
 * test descriptions when present.
 */
export type Expectation<TAction extends Action = Action> = {
	role: Role
	listState: ListState
	action: TAction
	expected: 'allow' | 'deny'
	reasonOnDeny?: string
}

/**
 * Build a stable key for a `(role, listState, action)` tuple. Used to
 * detect duplicate or contradictory expectations at module load.
 */
export function expectationKey(e: Pick<Expectation, 'role' | 'listState' | 'action'>): string {
	return `${e.role}|${e.listState.privacy}/${e.listState.active ? 'active' : 'inactive'}|${e.action}`
}

/**
 * Asserts no two expectations share the same `(role, listState, action)`
 * tuple. Throws at module load if the matrix is internally inconsistent.
 */
export function assertNoDuplicateExpectations(expectations: ReadonlyArray<Expectation>): void {
	const seen = new Map<string, Expectation>()
	for (const exp of expectations) {
		const key = expectationKey(exp)
		const prior = seen.get(key)
		if (prior && prior.expected !== exp.expected) {
			throw new Error(
				`Contradictory expectation for ${key}: existing=${prior.expected}, new=${exp.expected}. ` + `Pick one or remove the duplicate.`
			)
		}
		if (prior) {
			throw new Error(`Duplicate expectation for ${key} (same outcome). Remove the duplicate.`)
		}
		seen.set(key, exp)
	}
}

/**
 * Pretty-print a list state for test names: "public/active",
 * "private/inactive", etc.
 */
export function describeListState(state: ListState): string {
	return `${state.privacy}/${state.active ? 'active' : 'inactive'}`
}
