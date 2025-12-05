import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { asc } from 'drizzle-orm'

import { db } from '@/db'
import { userRelationships, users } from '@/db/schema'
import { auth } from '@/lib/auth'
import { authMiddleware } from '@/middleware/auth'

// Get all users (excluding current user) with their relationships
export const getUsersWithRelationships = createServerFn({
	method: 'GET',
})
	.middleware([authMiddleware])
	.handler(async () => {
		const session = await auth.api.getSession({ headers: getRequestHeaders() })

		if (!session?.user.id) {
			throw new Error('Unauthorized')
		}

		const currentUserId = session.user.id

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
				isRestricted: relationship?.isRestricted ?? false,
			}
		})
	})

// Upsert user relationships
export const upsertUserRelationships = createServerFn({
	method: 'POST',
})
	.middleware([authMiddleware])
	.inputValidator(
		(data: {
			relationships: Array<{
				viewerUserId: string
				canView: boolean
				canEdit: boolean
				isRestricted: boolean
			}>
		}) => data
	)
	.handler(async ({ data }) => {
		const session = await auth.api.getSession({ headers: getRequestHeaders() })

		if (!session?.user.id) {
			throw new Error('Unauthorized')
		}

		const ownerUserId = session.user.id

		// Upsert each relationship
		for (const rel of data.relationships) {
			await db
				.insert(userRelationships)
				.values({
					ownerUserId,
					viewerUserId: rel.viewerUserId,
					canView: rel.canView,
					canEdit: rel.canEdit,
					isRestricted: rel.isRestricted,
				})
				.onConflictDoUpdate({
					target: [userRelationships.ownerUserId, userRelationships.viewerUserId],
					set: {
						canView: rel.canView,
						canEdit: rel.canEdit,
						isRestricted: rel.isRestricted,
					},
				})
		}

		return { success: true }
	})
