import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { db } from '@/db'
import { getPermissionsMatrixQuery } from '@/db/queries/permissions-matrix'
import { getAllUsersQuery, getUserDetailsQuery } from '@/db/queries/users'
import type { BirthMonth, Role } from '@/db/schema'
import { giftedItems, guardianships, items, itemScrapes, users } from '@/db/schema'
import { loggingMiddleware } from '@/lib/logger'
import { sendTestEmail } from '@/lib/resend'
import { cleanupImageUrls } from '@/lib/storage/cleanup'
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
export const getPermissionsMatrixAsAdmin = createServerFn({
	method: 'GET',
})
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.handler(async () => {
		return await getPermissionsMatrixQuery()
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
			birthYear?: number | null
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
			birthYear?: number | null
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
		if (updateData.birthYear !== undefined) updateFields.birthYear = updateData.birthYear
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
// Delete user (admin)
// ===============================
// Hard-deletes the user and everything tied to them. Most cleanup is handled
// by FK onDelete:'cascade' (sessions, accounts, lists, items, claims,
// comments, list-editors, addons, guardianships, user-relationships). Two
// things need manual handling: users.partnerId has no FK constraint, so any
// other user pointing here would be left dangling; and the avatar object in
// storage is referenced by URL only.

export type DeleteUserResult = { kind: 'ok' } | { kind: 'error'; reason: 'self-delete' | 'not-found' }

export async function deleteUserAsAdminImpl(args: {
	db: SchemaDatabase
	actor: { id: string }
	input: { userId: string }
}): Promise<DeleteUserResult> {
	const { db: dbx, actor, input } = args
	const { userId } = input

	if (userId === actor.id) {
		return { kind: 'error', reason: 'self-delete' }
	}

	const user = await dbx.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { image: true },
	})
	if (!user) return { kind: 'error', reason: 'not-found' }

	await dbx.transaction(async tx => {
		// Clear dangling partner pointers (no FK constraint on partnerId).
		await tx.update(users).set({ partnerId: null }).where(eq(users.partnerId, userId))
		// Pre-null item_scrapes.userId before falling into the cascade. Without
		// this, PG fires the SET NULL action on rows whose item_id is also
		// being cascade-deleted in the same statement, then re-validates the
		// stale item_id FK on the now-updated row and aborts the transaction.
		await tx.update(itemScrapes).set({ userId: null }).where(eq(itemScrapes.userId, userId))
		// FK cascades take care of sessions, accounts, lists (and their
		// items/claims/comments/addons/editors), guardianships, etc.
		await tx.delete(users).where(eq(users.id, userId))
	})

	// Best-effort avatar cleanup, after the DB commit.
	if (user.image) {
		void cleanupImageUrls([user.image])
	}

	return { kind: 'ok' }
}

export const deleteUserAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: { userId: string }) => data)
	.handler(({ context, data }) =>
		deleteUserAsAdminImpl({
			db,
			actor: { id: context.session.user.id },
			input: data,
		})
	)

// ===============================
// Admin bulk archive - archive all claimed, non-archived items
// ===============================
// Spec §2.3 trigger 1: "admins can archive all currently-claimed-but-
// not-archived items (cleanup)."

export type BulkArchiveResult = { kind: 'ok'; archivedCount: number }

export async function bulkArchiveClaimedItemsImpl(args: { db: SchemaDatabase }): Promise<BulkArchiveResult> {
	const { db: dbx } = args
	// Find all non-archived items that have at least one claim.
	const claimedItemIds = await dbx
		.selectDistinct({ itemId: giftedItems.itemId })
		.from(giftedItems)
		.innerJoin(items, and(eq(items.id, giftedItems.itemId), eq(items.isArchived, false)))

	if (claimedItemIds.length === 0) {
		return { kind: 'ok', archivedCount: 0 }
	}

	const ids = claimedItemIds.map(r => r.itemId)
	await dbx.update(items).set({ isArchived: true }).where(inArray(items.id, ids))

	return { kind: 'ok', archivedCount: ids.length }
}

export const bulkArchiveClaimedItems = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.handler(() => bulkArchiveClaimedItemsImpl({ db }))
