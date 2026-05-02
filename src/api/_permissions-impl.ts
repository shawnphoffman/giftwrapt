// Server-only relationship/permission implementations.

import { and, asc, eq, inArray } from 'drizzle-orm'

import { db, type SchemaDatabase } from '@/db'
import type { BirthMonth } from '@/db/schema'
import { accessLevelEnumValues, guardianships, listEditors, userRelationships, users } from '@/db/schema'
import type { AccessLevel } from '@/db/schema/enums'

export type RelationshipRow = {
	id: string
	email: string
	name: string | null
	image: string | null
	accessLevel: AccessLevel
	canEdit: boolean
	// True iff the target user is in `guardianships` or `users.partnerId` for
	// the current user, in which case `restricted` cannot be set on the
	// relationship (see role rules in logic.md).
	cannotBeRestricted: boolean
}

async function getCannotBeRestrictedSet(dbx: SchemaDatabase, currentUserId: string, otherIds: ReadonlyArray<string>): Promise<Set<string>> {
	const out = new Set<string>()
	if (otherIds.length === 0) return out
	const ids = otherIds as Array<string>

	// Partner: symmetric. If X.partnerId === Y or Y.partnerId === X, neither
	// direction of the relationship can be 'restricted'.
	const me = await dbx.query.users.findFirst({
		where: eq(users.id, currentUserId),
		columns: { partnerId: true },
	})
	if (me?.partnerId && ids.includes(me.partnerId)) out.add(me.partnerId)
	const partneredBack = await dbx.query.users.findMany({
		where: inArray(users.id, ids),
		columns: { id: true, partnerId: true },
	})
	for (const u of partneredBack) {
		if (u.partnerId === currentUserId) out.add(u.id)
	}

	// Guardianship: any guardian/child pair must always be 'view' on both
	// directions. Cover both orientations of the pair.
	const asParent = await dbx.query.guardianships.findMany({
		where: and(eq(guardianships.parentUserId, currentUserId), inArray(guardianships.childUserId, ids)),
		columns: { childUserId: true },
	})
	for (const row of asParent) out.add(row.childUserId)
	const asChild = await dbx.query.guardianships.findMany({
		where: and(eq(guardianships.childUserId, currentUserId), inArray(guardianships.parentUserId, ids)),
		columns: { parentUserId: true },
	})
	for (const row of asChild) out.add(row.parentUserId)

	return out
}

export async function getUsersWithRelationshipsImpl(currentUserId: string): Promise<Array<RelationshipRow>> {
	const allUsers = await db.query.users.findMany({
		where: (us, { ne }) => ne(us.id, currentUserId),
		orderBy: [asc(users.name), asc(users.email)],
	})

	const relationships = await db.query.userRelationships.findMany({
		where: (rel, { eq }) => eq(rel.ownerUserId, currentUserId),
	})

	const map = new Map(relationships.map(rel => [rel.viewerUserId, rel]))
	const cannotBeRestricted = await getCannotBeRestrictedSet(
		db,
		currentUserId,
		allUsers.map(u => u.id)
	)

	return allUsers.map(user => {
		const r = map.get(user.id)
		return {
			id: user.id,
			email: user.email,
			name: user.name,
			image: user.image,
			accessLevel: r?.accessLevel ?? 'view',
			canEdit: r?.canEdit ?? false,
			cannotBeRestricted: cannotBeRestricted.has(user.id),
		}
	})
}

export async function getOwnersWithRelationshipsForMeImpl(currentUserId: string): Promise<Array<RelationshipRow>> {
	const allUsers = await db.query.users.findMany({
		where: (us, { ne }) => ne(us.id, currentUserId),
		orderBy: [asc(users.name), asc(users.email)],
	})

	const relationships = await db.query.userRelationships.findMany({
		where: (rel, { eq }) => eq(rel.viewerUserId, currentUserId),
	})

	const map = new Map(relationships.map(rel => [rel.ownerUserId, rel]))
	const cannotBeRestricted = await getCannotBeRestrictedSet(
		db,
		currentUserId,
		allUsers.map(u => u.id)
	)

	return allUsers.map(user => {
		const r = map.get(user.id)
		return {
			id: user.id,
			email: user.email,
			name: user.name,
			image: user.image,
			accessLevel: r?.accessLevel ?? 'view',
			canEdit: r?.canEdit ?? false,
			cannotBeRestricted: cannotBeRestricted.has(user.id),
		}
	})
}

// "My people" - the consolidated directory used by mobile/MCP clients
// to populate person pickers and resolve names like "Jason" to user
// IDs without making three round-trips. Returns every other user with
// computed flags for the four pairwise visibility/edit dimensions plus
// partner status.
//
// Defaults (no userRelationships row) match the rest of the app: open
// by default for canView, closed for canEdit. Consumers filter to
// `canIViewTheirList` to get the gift-shopping universe; to `isPartner`
// for the partner picker; etc.
export type MyPersonRow = {
	id: string
	email: string
	name: string | null
	image: string | null
	birthMonth: BirthMonth | null
	birthDay: number | null
	birthYear: number | null
	// Primary classification, prioritized partner > owner > viewer > none.
	// "owner" means I can view their list (they're a gift target for me).
	// "viewer" means they can view my list (I'm a gift target for them).
	relationship: 'partner' | 'owner' | 'viewer' | 'none'
	isPartner: boolean
	canIViewTheirList: boolean
	canIEditTheirList: boolean
	canTheyViewMyList: boolean
	canTheyEditMyList: boolean
	// New per-direction restricted flags, added alongside the
	// canView/canEdit dimensions so mobile clients can surface the same
	// state the web settings page exposes.
	myAccessToTheirList: AccessLevel
	theirAccessToMyList: AccessLevel
}

// `dbx` accepts either the singleton `db` or a transaction handle so
// integration tests can run inside `withRollback` without deadlocking
// against the open savepoint (pglite is single-connection). Production
// callers pass the imported singleton.
export async function getMyPeopleImpl(dbx: SchemaDatabase, currentUserId: string): Promise<Array<MyPersonRow>> {
	const me = await dbx.query.users.findFirst({
		where: (us, { eq }) => eq(us.id, currentUserId),
		columns: { partnerId: true },
	})
	const myPartnerId = me?.partnerId ?? null

	const allUsers = await dbx.query.users.findMany({
		where: (us, { ne }) => ne(us.id, currentUserId),
		orderBy: [asc(users.name), asc(users.email)],
	})

	// Rows where I'm the owner -> their access to MY list.
	const asViewerRels = await dbx.query.userRelationships.findMany({
		where: (rel, { eq }) => eq(rel.ownerUserId, currentUserId),
	})
	const viewerMap = new Map(asViewerRels.map(rel => [rel.viewerUserId, rel]))

	// Rows where I'm the viewer -> my access to THEIR list.
	const asOwnerRels = await dbx.query.userRelationships.findMany({
		where: (rel, { eq }) => eq(rel.viewerUserId, currentUserId),
	})
	const ownerMap = new Map(asOwnerRels.map(rel => [rel.ownerUserId, rel]))

	return allUsers.map(user => {
		const asViewer = viewerMap.get(user.id)
		const asOwner = ownerMap.get(user.id)
		const theirAccessToMyList = asViewer?.accessLevel ?? 'view'
		const myAccessToTheirList = asOwner?.accessLevel ?? 'view'
		const canTheyViewMyList = theirAccessToMyList !== 'none'
		const canTheyEditMyList = asViewer?.canEdit ?? false
		const canIViewTheirList = myAccessToTheirList !== 'none'
		const canIEditTheirList = asOwner?.canEdit ?? false
		const isPartner = user.id === myPartnerId

		let relationship: 'partner' | 'owner' | 'viewer' | 'none' = 'none'
		if (isPartner) relationship = 'partner'
		else if (canIViewTheirList) relationship = 'owner'
		else if (canTheyViewMyList) relationship = 'viewer'

		return {
			id: user.id,
			email: user.email,
			name: user.name,
			image: user.image,
			birthMonth: user.birthMonth,
			birthDay: user.birthDay,
			birthYear: user.birthYear,
			relationship,
			isPartner,
			canIViewTheirList,
			canIEditTheirList,
			canTheyViewMyList,
			canTheyEditMyList,
			myAccessToTheirList,
			theirAccessToMyList,
		}
	})
}

export type UpsertUserRelationshipsInput = {
	relationships: Array<{
		viewerUserId: string
		accessLevel: AccessLevel
		canEdit: boolean
	}>
}

export type UpsertUserRelationshipsResult =
	| { success: true }
	| { success: false; reason: 'restricted-not-allowed'; viewerUserIds: Array<string> }

export async function upsertUserRelationshipsImpl(args: {
	ownerUserId: string
	input: UpsertUserRelationshipsInput
	// `dbx` accepts either the singleton `db` or a transaction handle so
	// integration tests can run inside `withRollback` without deadlocking
	// against the open savepoint (pglite is single-connection). Production
	// callers omit it and get the singleton.
	dbx?: SchemaDatabase
}): Promise<UpsertUserRelationshipsResult> {
	const { ownerUserId, input, dbx = db } = args

	// Reject restricted on partner/guardian pairs in either direction.
	const restrictedTargets = input.relationships.filter(r => r.accessLevel === 'restricted').map(r => r.viewerUserId)
	if (restrictedTargets.length > 0) {
		const blocked = await getCannotBeRestrictedSet(dbx, ownerUserId, restrictedTargets)
		const offenders = restrictedTargets.filter(id => blocked.has(id))
		if (offenders.length > 0) {
			return { success: false, reason: 'restricted-not-allowed', viewerUserIds: offenders }
		}
	}

	await dbx.transaction(async tx => {
		for (const rel of input.relationships) {
			// Restricted suppresses canEdit. Persist canEdit=false alongside it
			// so a future read never observes the conflicting (restricted,
			// canEdit=true) state.
			const canEdit = rel.accessLevel === 'restricted' ? false : rel.canEdit
			await tx
				.insert(userRelationships)
				.values({
					ownerUserId,
					viewerUserId: rel.viewerUserId,
					accessLevel: rel.accessLevel,
					canEdit,
				})
				.onConflictDoUpdate({
					target: [userRelationships.ownerUserId, userRelationships.viewerUserId],
					set: { accessLevel: rel.accessLevel, canEdit },
				})

			// Restricted is mutually exclusive with list-level editor grants.
			// Drop any existing rows so the restricted relationship "wins" the
			// conflict immediately, in the same transaction as the upsert.
			if (rel.accessLevel === 'restricted') {
				await tx.delete(listEditors).where(and(eq(listEditors.ownerId, ownerUserId), eq(listEditors.userId, rel.viewerUserId)))
			}
		}
	})

	return { success: true }
}

export type UpsertViewerRelationshipsInput = {
	relationships: Array<{
		ownerUserId: string
		accessLevel: AccessLevel
	}>
}

export type UpsertViewerRelationshipsResult =
	| { success: true }
	| { success: false; reason: 'restricted-not-allowed'; ownerUserIds: Array<string> }

export async function upsertViewerRelationshipsImpl(args: {
	viewerUserId: string
	input: UpsertViewerRelationshipsInput
	dbx?: SchemaDatabase
}): Promise<UpsertViewerRelationshipsResult> {
	const { viewerUserId, input, dbx = db } = args

	const restrictedTargets = input.relationships.filter(r => r.accessLevel === 'restricted').map(r => r.ownerUserId)
	if (restrictedTargets.length > 0) {
		const blocked = await getCannotBeRestrictedSet(dbx, viewerUserId, restrictedTargets)
		const offenders = restrictedTargets.filter(id => blocked.has(id))
		if (offenders.length > 0) {
			return { success: false, reason: 'restricted-not-allowed', ownerUserIds: offenders }
		}
	}

	await dbx.transaction(async tx => {
		for (const rel of input.relationships) {
			await tx
				.insert(userRelationships)
				.values({
					ownerUserId: rel.ownerUserId,
					viewerUserId,
					accessLevel: rel.accessLevel,
				})
				.onConflictDoUpdate({
					target: [userRelationships.ownerUserId, userRelationships.viewerUserId],
					set: { accessLevel: rel.accessLevel },
				})

			if (rel.accessLevel === 'restricted') {
				await tx.delete(listEditors).where(and(eq(listEditors.ownerId, rel.ownerUserId), eq(listEditors.userId, viewerUserId)))
			}
		}
	})

	return { success: true }
}

// Re-export so other modules can import the canonical enum values list.
export { accessLevelEnumValues }
