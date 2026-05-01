// Server-only relationship/permission implementations.

import { asc } from 'drizzle-orm'

import { db, type SchemaDatabase } from '@/db'
import type { BirthMonth } from '@/db/schema'
import { userRelationships, users } from '@/db/schema'

export type RelationshipRow = {
	id: string
	email: string
	name: string | null
	image: string | null
	canView: boolean
	canEdit: boolean
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

	return allUsers.map(user => {
		const r = map.get(user.id)
		return {
			id: user.id,
			email: user.email,
			name: user.name,
			image: user.image,
			canView: r?.canView ?? true,
			canEdit: r?.canEdit ?? false,
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

	return allUsers.map(user => {
		const r = map.get(user.id)
		return {
			id: user.id,
			email: user.email,
			name: user.name,
			image: user.image,
			canView: r?.canView ?? true,
			canEdit: r?.canEdit ?? false,
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
		const canTheyViewMyList = asViewer?.canView ?? true
		const canTheyEditMyList = asViewer?.canEdit ?? false
		const canIViewTheirList = asOwner?.canView ?? true
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
		}
	})
}

export type UpsertUserRelationshipsInput = {
	relationships: Array<{
		viewerUserId: string
		canView: boolean
		canEdit: boolean
	}>
}

export async function upsertUserRelationshipsImpl(args: {
	ownerUserId: string
	input: UpsertUserRelationshipsInput
}): Promise<{ success: true }> {
	const { ownerUserId, input } = args
	for (const rel of input.relationships) {
		await db
			.insert(userRelationships)
			.values({
				ownerUserId,
				viewerUserId: rel.viewerUserId,
				canView: rel.canView,
				canEdit: rel.canEdit,
			})
			.onConflictDoUpdate({
				target: [userRelationships.ownerUserId, userRelationships.viewerUserId],
				set: {
					canView: rel.canView,
					canEdit: rel.canEdit,
				},
			})
	}
	return { success: true }
}

export type UpsertViewerRelationshipsInput = {
	relationships: Array<{
		ownerUserId: string
		canView: boolean
	}>
}

export async function upsertViewerRelationshipsImpl(args: {
	viewerUserId: string
	input: UpsertViewerRelationshipsInput
}): Promise<{ success: true }> {
	const { viewerUserId, input } = args
	for (const rel of input.relationships) {
		await db
			.insert(userRelationships)
			.values({
				ownerUserId: rel.ownerUserId,
				viewerUserId,
				canView: rel.canView,
			})
			.onConflictDoUpdate({
				target: [userRelationships.ownerUserId, userRelationships.viewerUserId],
				set: {
					canView: rel.canView,
				},
			})
	}
	return { success: true }
}
