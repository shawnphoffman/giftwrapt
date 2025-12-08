import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { getAllUsersQuery, getUserDetailsQuery } from '@/db/queries/users'
import { guardianships, users } from '@/db/schema'
import { sendTestEmail } from '@/lib/resend'
import { adminAuthMiddleware } from '@/middleware/auth'

//
export const getUsersAsAdmin = createServerFn({
	method: 'GET',
})
	.middleware([adminAuthMiddleware])
	.handler(async () => {
		return await getAllUsersQuery()
	})

//
export const getUserDetailsAsAdmin = createServerFn({
	method: 'GET',
})
	.middleware([adminAuthMiddleware])
	.inputValidator((data: { userId: string }) => data)
	.handler(async ({ data: { userId } }) => {
		return await getUserDetailsQuery(userId)
	})

//
export const sendTestEmailAsAdmin = createServerFn({
	method: 'POST',
})
	.middleware([adminAuthMiddleware])
	.handler(async () => {
		const result = await sendTestEmail()
		return { status: 'success', data: result }
	})

//
export const createGuardianships = createServerFn({
	method: 'POST',
})
	.middleware([adminAuthMiddleware])
	.inputValidator((data: { childUserId: string; parentUserIds: string[] }) => data)
	.handler(async ({ data }) => {
		const { childUserId, parentUserIds } = data

		// Create guardianship records for each parent
		for (const parentUserId of parentUserIds) {
			await db
				.insert(guardianships)
				.values({
					childUserId,
					parentUserId,
				})
				.onConflictDoNothing()
		}

		return { success: true }
	})

//
export const updateUserPartner = createServerFn({
	method: 'POST',
})
	.middleware([adminAuthMiddleware])
	.inputValidator((data: { userId: string; partnerId: string }) => data)
	.handler(async ({ data }) => {
		const { userId, partnerId } = data

		// Update the user's partnerId
		await db.update(users).set({ partnerId }).where(eq(users.id, userId))

		return { success: true }
	})
