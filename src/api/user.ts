import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, asc, eq, ne } from 'drizzle-orm'

import { db } from '@/db'
import type { BirthMonth } from '@/db/schema'
import { users } from '@/db/schema'
import { auth } from '@/lib/auth'
import { authMiddleware } from '@/middleware/auth'

// Get potential partners for the current user (non-child users excluding current user)
export const getPotentialPartners = createServerFn({
	method: 'GET',
})
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const currentUserId = context.session.user.id

		// Fetch all non-child users except current user
		const potentialPartners = await db.query.users.findMany({
			where: and(ne(users.id, currentUserId), ne(users.role, 'child')),
			orderBy: [asc(users.name), asc(users.email)],
			columns: {
				id: true,
				name: true,
				email: true,
				image: true,
				role: true,
			},
		})

		return potentialPartners
	})

// Update user profile
export const updateUserProfile = createServerFn({
	method: 'POST',
})
	.middleware([authMiddleware])
	.inputValidator((data: { name: string; birthMonth?: string | null; birthDay?: number | null; partnerId?: string | null }) => data)
	.handler(async ({ context, data }) => {
		const userId = context.session.user.id
		const currentPartnerId = context.session.user.partnerId || null

		// Build update object with only provided fields
		const updateData: {
			name?: string
			birthMonth?: BirthMonth | null
			birthDay?: number | null
			partnerId?: string | null
		} = {}

		updateData.name = data.name
		if (data.birthMonth !== undefined) {
			updateData.birthMonth = (data.birthMonth || null) as BirthMonth | null
		}
		if (data.birthDay !== undefined) {
			updateData.birthDay = data.birthDay ?? null
		}

		// Handle partner changes
		const newPartnerId = data.partnerId !== undefined ? data.partnerId || null : undefined

		// Wrap the entire bidirectional partner swap in a transaction. Without
		// it, a crash mid-way could leave orphaned references (A points to B
		// but B points somewhere else) and the UI would show a mismatched pair.
		const result = await db.transaction(async tx => {
			if (newPartnerId !== undefined) {
				updateData.partnerId = newPartnerId

				// Clear our previous partner's reference back to us (if changing).
				if (currentPartnerId && currentPartnerId !== newPartnerId) {
					await tx.update(users).set({ partnerId: null }).where(eq(users.id, currentPartnerId))
				}

				if (newPartnerId) {
					// If the incoming partner was linked to someone else, unlink that third party first.
					const newPartner = await tx.query.users.findFirst({
						where: eq(users.id, newPartnerId),
						columns: { partnerId: true },
					})
					if (newPartner?.partnerId && newPartner.partnerId !== userId) {
						await tx.update(users).set({ partnerId: null }).where(eq(users.id, newPartner.partnerId))
					}
					await tx.update(users).set({ partnerId: userId }).where(eq(users.id, newPartnerId))
				}
			}

			return await tx.update(users).set(updateData).where(eq(users.id, userId))
		})

		if (result.rowCount === 0) {
			throw new Error('Failed to update user')
		}

		await auth.api.updateUser({
			body: {
				name: data.name,
				...(data.birthDay !== undefined && { birthDay: data.birthDay ?? null }),
				...(data.birthMonth !== undefined && { birthMonth: data.birthMonth || null }),
				...(newPartnerId !== undefined && { partnerId: newPartnerId }),
			},
			headers: getRequestHeaders(),
		})

		return { success: true, rowsUpdated: result.rowCount }
	})

// Update user password
export const updateUserPassword = createServerFn({
	method: 'POST',
})
	.middleware([authMiddleware])
	.inputValidator((data: { currentPassword: string; newPassword: string }) => data)
	.handler(async ({ data }) => {
		// Use Better Auth's changePassword API
		const result = await auth.api.changePassword({
			body: {
				currentPassword: data.currentPassword,
				newPassword: data.newPassword,
			},
			headers: getRequestHeaders(),
		})

		if (result.error) {
			throw new Error(result.error.message || 'Failed to change password')
		}

		return { success: true }
	})
