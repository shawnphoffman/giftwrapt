import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { BirthMonth, users } from '@/db/schema'
import { auth } from '@/lib/auth'
import { authMiddleware } from '@/middleware/auth'
import { getRequestHeaders } from '@tanstack/react-start/server'

// Update user profile
export const updateUserProfile = createServerFn({
	method: 'POST',
})
	.middleware([authMiddleware])
	.inputValidator((data: { name: string; birthMonth?: string; birthDay?: number }) => data)
	.handler(async ({ data }) => {
		const session = await auth.api.getSession({ headers: getRequestHeaders() })

		if (!session?.user?.id) {
			throw new Error('Unauthorized')
		}

		const userId = session.user.id

		// Build update object with only provided fields
		const updateData: {
			name?: string
			birthMonth?: BirthMonth | null
			birthDay?: number | null
		} = {}

		// console.log('data', data)
		// console.log('userId', userId)

		if (data.name !== undefined) {
			updateData.name = data.name
		}
		if (data.birthMonth !== undefined) {
			updateData.birthMonth = data.birthMonth as BirthMonth | null
		}
		if (data.birthDay !== undefined) {
			updateData.birthDay = data.birthDay || null
		}

		// Update user in database
		const result = await db.update(users).set(updateData).where(eq(users.id, userId))
		console.log('result', result?.rowCount)

		if (result?.rowCount === 0) {
			throw new Error('Failed to update user')
		}

		const result2 = await auth.api.updateUser({
			body: {
				name: data.name,
				birthDay: data.birthDay,
				birthMonth: data.birthMonth,
			},
			headers: getRequestHeaders(),
		})
		console.log('result2', result2)

		return { success: true, rowsUpdated: result?.rowCount }
	})
