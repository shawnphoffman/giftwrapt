import { createServerFn } from '@tanstack/react-start'
import { asc } from 'drizzle-orm'

import { db } from '@/db'
import { userRelationships, users } from '@/db/schema'
import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

// Get all users (excluding current user) with their relationships
export const getUsersWithRelationships = createServerFn({
	method: 'GET',
})
	.middleware([authMiddleware, loggingMiddleware])
	.handler(async ({ context }) => {
		const currentUserId = context.session.user.id

		// Fetch all users except current user
		const allUsers = await db.query.users.findMany({
			where: (us, { ne }) => ne(us.id, currentUserId),
			orderBy: [asc(users.name), asc(users.email)],
		})

		// Fetch existing relationships where current user is the owner
		const relationships = await db.query.userRelationships.findMany({
			where: (rel, { eq }) => eq(rel.ownerUserId, currentUserId),
		})

		// Create a map of viewerUserId -> relationship
		const relationshipMap = new Map(relationships.map(rel => [rel.viewerUserId, rel]))

		// Combine users with their relationships
		return allUsers.map(user => {
			const relationship = relationshipMap.get(user.id)
			return {
				id: user.id,
				email: user.email,
				name: user.name,
				image: user.image,
				canView: relationship?.canView ?? true,
				canEdit: relationship?.canEdit ?? false,
			}
		})
	})

// Get all users (excluding current user) with relationships where current user is the viewer
export const getOwnersWithRelationshipsForMe = createServerFn({
	method: 'GET',
})
	.middleware([authMiddleware, loggingMiddleware])
	.handler(async ({ context }) => {
		const currentUserId = context.session.user.id

		// Fetch all users except current user (these are potential list owners)
		const allUsers = await db.query.users.findMany({
			where: (us, { ne }) => ne(us.id, currentUserId),
			orderBy: [asc(users.name), asc(users.email)],
		})

		// Fetch relationships where current user is the viewer
		const relationships = await db.query.userRelationships.findMany({
			where: (rel, { eq }) => eq(rel.viewerUserId, currentUserId),
		})

		// Create a map of ownerUserId -> relationship
		const relationshipMap = new Map(relationships.map(rel => [rel.ownerUserId, rel]))

		// Combine owners with their relationship as it applies to the current viewer
		return allUsers.map(user => {
			const relationship = relationshipMap.get(user.id)
			return {
				id: user.id,
				email: user.email,
				name: user.name,
				image: user.image,
				canView: relationship?.canView ?? true,
			}
		})
	})

// Upsert user relationships
export const upsertUserRelationships = createServerFn({
	method: 'POST',
})
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator(
		(data: {
			relationships: Array<{
				viewerUserId: string
				canView: boolean
				canEdit: boolean
			}>
		}) => data
	)
	.handler(async ({ context, data }) => {
		const ownerUserId = context.session.user.id

		// Upsert each relationship
		for (const rel of data.relationships) {
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
	})

// Upsert relationships where current user is the viewer (canView only)
export const upsertViewerRelationships = createServerFn({
	method: 'POST',
})
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator(
		(data: {
			relationships: Array<{
				ownerUserId: string
				canView: boolean
			}>
		}) => data
	)
	.handler(async ({ context, data }) => {
		const viewerUserId = context.session.user.id

		for (const rel of data.relationships) {
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
	})
