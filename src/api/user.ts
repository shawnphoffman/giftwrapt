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
	.handler(async () => {
		const session = await auth.api.getSession({ headers: getRequestHeaders() })

		if (!session?.user.id) {
			throw new Error('Unauthorized')
		}

		const currentUserId = session.user.id

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
	.handler(async ({ data }) => {
		const session = await auth.api.getSession({ headers: getRequestHeaders() })

		if (!session?.user.id) {
			throw new Error('Unauthorized')
		}

		const userId = session.user.id
		const currentPartnerId = session.user.partnerId || null

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
		if (newPartnerId !== undefined) {
			updateData.partnerId = newPartnerId

			// Handle bidirectional partner relationship
			// If we had a previous partner, clear their partnerId reference to us
			if (currentPartnerId && currentPartnerId !== newPartnerId) {
				await db.update(users).set({ partnerId: null }).where(eq(users.id, currentPartnerId))
			}

			// If we have a new partner, update their partnerId to reference us
			if (newPartnerId) {
				// First, clear the new partner's old partner reference if they had one
				const newPartner = await db.query.users.findFirst({
					where: eq(users.id, newPartnerId),
					columns: { partnerId: true },
				})
				if (newPartner?.partnerId && newPartner.partnerId !== userId) {
					// Clear the old partner's reference
					await db.update(users).set({ partnerId: null }).where(eq(users.id, newPartner.partnerId))
				}
				// Set the new partner's partnerId to us
				await db.update(users).set({ partnerId: userId }).where(eq(users.id, newPartnerId))
			}
		}

		// Update user in database
		const result = await db.update(users).set(updateData).where(eq(users.id, userId))

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
		const session = await auth.api.getSession({ headers: getRequestHeaders() })

		if (!session?.user.id) {
			throw new Error('Unauthorized')
		}

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
