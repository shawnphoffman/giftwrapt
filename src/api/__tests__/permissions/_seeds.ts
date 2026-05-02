import type { SchemaDatabase } from '@/db'
import type { List, User } from '@/db/schema'
import type { ListState, Role } from '@/lib/__tests__/permissions/_matrix-types'

import { makeGuardianship, makeList, makeListEditor, makeUser, makeUserRelationship } from '../../../../test/integration/factories'

/**
 * Standard scenario every list-level permission test consumes. Resource
 * tests for items / claims / comments etc. extend this shape with their
 * own fixtures (an item under the list, a claim on the item, etc.).
 */
export type ListScenario = {
	viewer: User
	owner: User
	list: List
}

type SeedArgs = {
	tx: SchemaDatabase
	listState: ListState
}

function listOverridesFor(state: ListState): {
	type: 'wishlist' | 'giftideas'
	isPrivate: boolean
	isActive: boolean
	giftIdeasTargetUserId?: string | null
} {
	if (state.privacy === 'gift-ideas') {
		return { type: 'giftideas', isPrivate: true, isActive: state.active }
	}
	return { type: 'wishlist', isPrivate: state.privacy === 'private', isActive: state.active }
}

/**
 * Maps a `Role` to the seeder that produces the matching scenario. Each
 * seeder is responsible for putting the database into a state where the
 * declared role accurately describes the relationship between viewer
 * and owner.
 *
 * Seeders are kept tiny and explicit — no shared helper that switches on
 * `role` internally — so the role contract is greppable from any test
 * file that consults the matrix.
 */
export const SEEDERS: Record<Role, (args: SeedArgs) => Promise<ListScenario>> = {
	owner: async ({ tx, listState }) => {
		const owner = await makeUser(tx)
		const list = await makeList(tx, { ownerId: owner.id, ...listOverridesFor(listState) })
		// "Viewer" is the same user as the owner.
		return { viewer: owner, owner, list }
	},

	guardian: async ({ tx, listState }) => {
		const owner = await makeUser(tx, { role: 'child' })
		const viewer = await makeUser(tx)
		await makeGuardianship(tx, { parentUserId: viewer.id, childUserId: owner.id })
		const list = await makeList(tx, { ownerId: owner.id, ...listOverridesFor(listState) })
		return { viewer, owner, list }
	},

	partner: async ({ tx, listState }) => {
		// Bidirectional partnerId: each user points at the other.
		const ownerId = `user_owner_${Date.now()}`
		const viewerId = `user_partner_${Date.now()}`
		const owner = await makeUser(tx, { id: ownerId, partnerId: viewerId })
		const viewer = await makeUser(tx, { id: viewerId, partnerId: ownerId })
		const list = await makeList(tx, { ownerId: owner.id, ...listOverridesFor(listState) })
		return { viewer, owner, list }
	},

	'list-editor': async ({ tx, listState }) => {
		const owner = await makeUser(tx)
		const viewer = await makeUser(tx)
		const list = await makeList(tx, { ownerId: owner.id, ...listOverridesFor(listState) })
		await makeListEditor(tx, { listId: list.id, userId: viewer.id, ownerId: owner.id })
		return { viewer, owner, list }
	},

	'user-edit': async ({ tx, listState }) => {
		const owner = await makeUser(tx)
		const viewer = await makeUser(tx)
		await makeUserRelationship(tx, {
			ownerUserId: owner.id,
			viewerUserId: viewer.id,
			canEdit: true,
		})
		const list = await makeList(tx, { ownerId: owner.id, ...listOverridesFor(listState) })
		return { viewer, owner, list }
	},

	denied: async ({ tx, listState }) => {
		const owner = await makeUser(tx)
		const viewer = await makeUser(tx)
		await makeUserRelationship(tx, {
			ownerUserId: owner.id,
			viewerUserId: viewer.id,
			canView: false,
		})
		const list = await makeList(tx, { ownerId: owner.id, ...listOverridesFor(listState) })
		return { viewer, owner, list }
	},

	restricted: async ({ tx, listState }) => {
		const owner = await makeUser(tx)
		const viewer = await makeUser(tx)
		await makeUserRelationship(tx, {
			ownerUserId: owner.id,
			viewerUserId: viewer.id,
			accessLevel: 'restricted',
		})
		const list = await makeList(tx, { ownerId: owner.id, ...listOverridesFor(listState) })
		return { viewer, owner, list }
	},

	default: async ({ tx, listState }) => {
		const owner = await makeUser(tx)
		const viewer = await makeUser(tx)
		const list = await makeList(tx, { ownerId: owner.id, ...listOverridesFor(listState) })
		return { viewer, owner, list }
	},

	'child-role': async ({ tx, listState }) => {
		const owner = await makeUser(tx)
		const viewer = await makeUser(tx, { role: 'child' })
		const list = await makeList(tx, { ownerId: owner.id, ...listOverridesFor(listState) })
		return { viewer, owner, list }
	},
}

/**
 * Convenience wrapper used by per-resource integration tests:
 * `await seedFor('guardian', { tx, listState: { privacy: 'private', active: true } })`.
 */
export async function seedFor(role: Role, args: SeedArgs): Promise<ListScenario> {
	return SEEDERS[role](args)
}
