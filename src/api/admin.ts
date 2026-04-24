import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/db'
import { getAllUsersQuery, getUserDetailsQuery } from '@/db/queries/users'
import type { BirthMonth, Role } from '@/db/schema'
import { giftedItems, guardianships, items, users } from '@/db/schema'
import { loggingMiddleware } from '@/lib/logger'
import { sendTestEmail } from '@/lib/resend'
import { adminAuthMiddleware } from '@/middleware/auth'

//
export const getUsersAsAdmin = createServerFn({
	method: 'GET',
})
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.handler(async () => {
		return await getAllUsersQuery()
	})

//
export const getUserDetailsAsAdmin = createServerFn({
	method: 'GET',
})
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: { userId: string }) => data)
	.handler(async ({ data: { userId } }) => {
		return await getUserDetailsQuery(userId)
	})

//
export const sendTestEmailAsAdmin = createServerFn({
	method: 'POST',
})
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.handler(async () => {
		const result = await sendTestEmail()
		return { status: 'success', data: result }
	})

//
export const createGuardianships = createServerFn({
	method: 'POST',
})
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: { childUserId: string; parentUserIds: Array<string> }) => data)
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
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: { userId: string; partnerId: string | null }) => data)
	.handler(async ({ data }) => {
		const { userId, partnerId } = data

		// Update the user's partnerId
		await db.update(users).set({ partnerId }).where(eq(users.id, userId))

		return { success: true }
	})

//
export const getGuardianshipsForChild = createServerFn({
	method: 'GET',
})
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: { childUserId: string }) => data)
	.handler(async ({ data: { childUserId } }) => {
		const guardianshipRecords = await db.select().from(guardianships).where(eq(guardianships.childUserId, childUserId))

		return guardianshipRecords.map(g => g.parentUserId)
	})

//
export const updateGuardianships = createServerFn({
	method: 'POST',
})
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: { childUserId: string; parentUserIds: Array<string> }) => data)
	.handler(async ({ data }) => {
		const { childUserId, parentUserIds } = data

		// Delete all existing guardianships for this child
		await db.delete(guardianships).where(eq(guardianships.childUserId, childUserId))

		// Create new guardianship records
		for (const parentUserId of parentUserIds) {
			await db.insert(guardianships).values({
				childUserId,
				parentUserId,
			})
		}

		return { success: true }
	})

//
export const updateUserAsAdmin = createServerFn({
	method: 'POST',
})
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator(
		(data: {
			userId: string
			email?: string
			name?: string
			role?: string
			birthMonth?: BirthMonth | null
			birthDay?: number | null
			image?: string | null
			partnerId?: string | null
		}) => data
	)
	.handler(async ({ data }) => {
		const { userId, ...updateData } = data

		// Build update object with only provided fields
		const updateFields: {
			email?: string
			name?: string
			role?: Role
			birthMonth?: BirthMonth | null
			birthDay?: number | null
			image?: string | null
			partnerId?: string | null
		} = {}

		if (updateData.email !== undefined) updateFields.email = updateData.email
		if (updateData.name !== undefined) updateFields.name = updateData.name
		if (updateData.role !== undefined) {
			updateFields.role = updateData.role as Role
		} else {
			updateFields.role = 'user'
		}
		if (updateData.birthMonth !== undefined) updateFields.birthMonth = updateData.birthMonth
		if (updateData.birthDay !== undefined) updateFields.birthDay = updateData.birthDay
		if (updateData.image !== undefined) updateFields.image = updateData.image
		if (updateData.partnerId !== undefined) updateFields.partnerId = updateData.partnerId

		// Update user in database
		await db.update(users).set(updateFields).where(eq(users.id, userId))

		// Also update via Better Auth if email or name changed
		if (updateData.email || updateData.name) {
			// Note: Better Auth updateUser might need to be called separately
			// This depends on your Better Auth setup
		}

		return { success: true }
	})

// ===============================
// Admin bulk archive - archive all claimed, non-archived items
// ===============================
// Spec §2.3 trigger 1: "admins can archive all currently-claimed-but-
// not-archived items (cleanup)."

export type BulkArchiveResult = { kind: 'ok'; archivedCount: number }

export const bulkArchiveClaimedItems = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.handler(async (): Promise<BulkArchiveResult> => {
		// Find all non-archived items that have at least one claim.
		const claimedItemIds = await db
			.selectDistinct({ itemId: giftedItems.itemId })
			.from(giftedItems)
			.innerJoin(items, and(eq(items.id, giftedItems.itemId), eq(items.isArchived, false)))

		if (claimedItemIds.length === 0) {
			return { kind: 'ok', archivedCount: 0 }
		}

		const ids = claimedItemIds.map(r => r.itemId)
		await db.update(items).set({ isArchived: true }).where(inArray(items.id, ids))

		return { kind: 'ok', archivedCount: ids.length }
	})
