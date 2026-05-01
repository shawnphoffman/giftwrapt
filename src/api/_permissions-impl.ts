// Server-only relationship/permission implementations.

import { asc } from 'drizzle-orm'

import { db } from '@/db'
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
