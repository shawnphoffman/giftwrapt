import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, inArray, isNotNull, ne } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { db } from '@/db'
import { getPermissionsMatrixQuery } from '@/db/queries/permissions-matrix'
import { getAllUsersQuery, getUserDetailsQuery } from '@/db/queries/users'
import type { BirthMonth, Role } from '@/db/schema'
import { giftedItems, guardianships, items, itemScrapes, lists, users } from '@/db/schema'
import { loggingMiddleware } from '@/lib/logger'
import { applyPartnerAndAnniversary } from '@/lib/partner-update'
import { sendTestEmail } from '@/lib/resend'
import { cleanupImageUrls } from '@/lib/storage/cleanup'
import { adminAuthMiddleware } from '@/middleware/auth'

import {
	addRelationLabelImpl,
	AddRelationLabelInputSchema,
	type AddRelationLabelResult,
	getMyRelationLabelsImpl,
	type RelationLabelRow,
	removeRelationLabelImpl,
	RemoveRelationLabelInputSchema,
	type RemoveRelationLabelResult,
} from './_relation-labels-impl'

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
			partnerAnniversary?: string | null
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
			partnerAnniversary?: string | null
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

		// Partner + anniversary go through the shared helper so the
		// bidirectional mirror (and dangling-anniversary guards) match the
		// self-edit path exactly. Admins act on behalf of the target user,
		// so `userId` here is the EDITED user, not the actor.
		const me = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { partnerId: true } })
		const currentPartnerId = me?.partnerId ?? null
		const newPartnerId = updateData.partnerId !== undefined ? updateData.partnerId || null : undefined
		const newAnniversary = updateData.partnerAnniversary !== undefined ? updateData.partnerAnniversary || null : undefined

		await db.transaction(async tx => {
			const { selfUpdates } = await applyPartnerAndAnniversary(tx, {
				userId,
				currentPartnerId,
				newPartnerId,
				newAnniversary,
			})
			Object.assign(updateFields, selfUpdates)
			if (Object.keys(updateFields).length > 0) {
				await tx.update(users).set(updateFields).where(eq(users.id, userId))
			}
		})

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
// Relation labels (admin acting on behalf of a user)
// ===============================
// Mirror of the self-service relation-labels server fns, but the target
// user is whoever the admin is editing instead of the actor. The impl
// functions are written generically around `userId` so we just feed in
// the edited user's id.

export const getRelationLabelsForUserAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: { userId: string }) => data)
	.handler(({ data }): Promise<Array<RelationLabelRow>> => getMyRelationLabelsImpl({ userId: data.userId }))

export const addRelationLabelForUserAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: { userId: string; label: string; targetUserId?: string; targetDependentId?: string }) => ({
		userId: data.userId,
		input: AddRelationLabelInputSchema.parse({
			label: data.label,
			targetUserId: data.targetUserId,
			targetDependentId: data.targetDependentId,
		}),
	}))
	.handler(({ data }): Promise<AddRelationLabelResult> => addRelationLabelImpl({ userId: data.userId, input: data.input }))

export const removeRelationLabelForUserAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: { userId: string; id: number }) => ({
		userId: data.userId,
		input: RemoveRelationLabelInputSchema.parse({ id: data.id }),
	}))
	.handler(({ data }): Promise<RemoveRelationLabelResult> => removeRelationLabelImpl({ userId: data.userId, input: data.input }))

// Candidate people for an admin-driven relation-labels picker. Mirrors
// `getGiftIdeasRecipients` but excludes the edited user (not the actor)
// and applies no privacy filter: the actor is an admin and the edited
// user's own 'none' relationships are a self-service preference, not a
// constraint on what an admin can assign.
export const getRelationLabelCandidatesForUserAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: { userId: string }) => data)
	.handler(async ({ data }) => {
		return await db.query.users.findMany({
			where: ne(users.id, data.userId),
			orderBy: [asc(users.name), asc(users.email)],
			columns: { id: true, name: true, email: true, image: true, role: true },
		})
	})

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

// ===============================
// Admin purge - hard-delete all lists and their dependents
// ===============================
// Wipes every list (and FK-cascaded items, claims, addons, editors,
// item_groups, item_comments, item_scrapes) without touching users,
// guardianships, partner pointers, or auth rows. Used by /admin/data to
// reset content while keeping accounts intact, e.g. after archiving made
// a list undeletable from the regular UI.

export type PurgeAllListsResult = {
	kind: 'ok'
	listsDeleted: number
	itemsDeleted: number
	claimsDeleted: number
}

export async function purgeAllListsImpl(args: { db: SchemaDatabase }): Promise<PurgeAllListsResult> {
	const { db: dbx } = args

	// Snapshot image URLs before the cascade so storage cleanup can run
	// after the DB commit. The DB rows are gone by then.
	const itemImageRows = await dbx.select({ imageUrl: items.imageUrl }).from(items).where(isNotNull(items.imageUrl))
	const imageUrls = itemImageRows.map(r => r.imageUrl)

	let listsDeleted = 0
	let itemsDeleted = 0
	let claimsDeleted = 0

	await dbx.transaction(async tx => {
		const itemRows = await tx.select({ id: items.id }).from(items)
		itemsDeleted = itemRows.length

		const claimRows = await tx.select({ id: giftedItems.id }).from(giftedItems)
		claimsDeleted = claimRows.length

		const listRows = await tx.select({ id: lists.id }).from(lists)
		listsDeleted = listRows.length

		// Single delete; FK cascades handle items, listAddons, listEditors,
		// itemGroups, giftedItems, itemComments, itemScrapes.
		await tx.delete(lists)
	})

	if (imageUrls.length > 0) {
		void cleanupImageUrls(imageUrls)
	}

	return { kind: 'ok', listsDeleted, itemsDeleted, claimsDeleted }
}

export const purgeAllListsAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.handler(() => purgeAllListsImpl({ db }))
