import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { and, asc, eq, inArray, isNotNull, ne } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { db } from '@/db'
import { getPermissionsMatrixQuery } from '@/db/queries/permissions-matrix'
import { getAllUsersQuery, getUserDetailsQuery } from '@/db/queries/users'
import type { BirthMonth, Role } from '@/db/schema'
import { giftedItems, guardianships, items, itemScrapes, lists, users } from '@/db/schema'
import { auth } from '@/lib/auth'
import { visibleItemsWhere } from '@/lib/item-visibility'
import { loggingMiddleware } from '@/lib/logger'
import { applyPartnerAndAnniversary } from '@/lib/partner-update'
import { isEmailConfigured, sendTestEmail, type TestEmailKind } from '@/lib/resend'
import { cleanupImageUrls } from '@/lib/storage/cleanup'
import { adminAuthMiddleware } from '@/middleware/auth'

import {
	getOwnersWithRelationshipsForMeImpl,
	getUsersWithRelationshipsImpl,
	type RelationshipRow,
	upsertUserRelationshipsImpl,
	type UpsertUserRelationshipsInput,
	type UpsertUserRelationshipsResult,
	upsertViewerRelationshipsImpl,
	type UpsertViewerRelationshipsInput,
	type UpsertViewerRelationshipsResult,
} from './_permissions-impl'
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

// Children cannot be guardians (see logic.md). The admin forms filter child
// users out of the guardian picker, but the write endpoints have to enforce
// it too so a direct call can't create an invalid guardianship.
async function assertGuardiansNotChildren(parentUserIds: ReadonlyArray<string>): Promise<void> {
	if (parentUserIds.length === 0) return
	const parents = await db.query.users.findMany({
		where: inArray(users.id, parentUserIds as Array<string>),
		columns: { id: true, role: true },
	})
	if (parents.some(p => p.role === 'child')) {
		throw new Error('Children cannot be guardians.')
	}
}

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
	.inputValidator((data: { kind?: TestEmailKind; to?: string } | undefined) => data ?? {})
	.handler(async ({ data }) => {
		const result = await sendTestEmail(data.kind ?? 'test', data.to)
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

		await assertGuardiansNotChildren(parentUserIds)

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

		// Route through the shared helper so the partnership is mirrored on
		// both rows (the old raw one-directional write left A->B without B->A)
		// and the child-partner guard applies here too.
		const me = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { partnerId: true } })
		await db.transaction(async tx => {
			const { selfUpdates } = await applyPartnerAndAnniversary(tx, {
				userId,
				currentPartnerId: me?.partnerId ?? null,
				newPartnerId: partnerId,
				newAnniversary: undefined,
			})
			if (Object.keys(selfUpdates).length > 0) {
				await tx.update(users).set(selfUpdates).where(eq(users.id, userId))
			}
		})

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

		await assertGuardiansNotChildren(parentUserIds)

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
// Account-level admin actions: password reset email, set password, ban toggle
// ===============================
// These funnel into better-auth's admin plugin API via `auth.api.*`. The
// middleware has already verified the actor is an admin; we forward the
// inbound request headers so better-auth re-verifies the cookie when
// gating its own admin endpoints.

export type AccountActionResult =
	| { kind: 'ok' }
	| { kind: 'skipped'; reason: 'email-not-configured' }
	| { kind: 'error'; reason: 'not-found' | 'self-target' | 'failed'; message?: string }

export const sendPasswordResetEmailAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: { userId: string }) => data)
	.handler(async ({ data: { userId } }): Promise<AccountActionResult> => {
		const target = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { email: true } })
		if (!target?.email) return { kind: 'error', reason: 'not-found' }
		// Bail before calling better-auth so we can surface a clear "no email
		// configured" toast instead of pretending we sent something. The
		// underlying `sendResetPassword` hook would otherwise log + return null.
		if (!(await isEmailConfigured())) return { kind: 'skipped', reason: 'email-not-configured' }
		try {
			await auth.api.requestPasswordReset({
				body: { email: target.email, redirectTo: '/reset-password' },
				headers: getRequest().headers,
			})
			return { kind: 'ok' }
		} catch (err) {
			return { kind: 'error', reason: 'failed', message: err instanceof Error ? err.message : 'Failed to send' }
		}
	})

export const setUserPasswordAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: { userId: string; newPassword: string }) => {
		if (data.newPassword.length < 8) {
			throw new Error('Password must be at least 8 characters.')
		}
		return data
	})
	.handler(async ({ context, data: { userId, newPassword } }): Promise<AccountActionResult> => {
		if (userId === context.session.user.id) {
			return { kind: 'error', reason: 'self-target' }
		}
		const target = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true } })
		if (!target) return { kind: 'error', reason: 'not-found' }
		try {
			const headers = getRequest().headers
			await auth.api.setUserPassword({ body: { userId, newPassword }, headers })
			// Forcing a new password should kick existing sessions; the user
			// signs back in with the new credential.
			await auth.api.revokeUserSessions({ body: { userId }, headers })
			return { kind: 'ok' }
		} catch (err) {
			return { kind: 'error', reason: 'failed', message: err instanceof Error ? err.message : 'Failed to update password' }
		}
	})

export const setUserBannedAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: { userId: string; banned: boolean }) => data)
	.handler(async ({ context, data: { userId, banned } }): Promise<AccountActionResult> => {
		if (userId === context.session.user.id) {
			return { kind: 'error', reason: 'self-target' }
		}
		const target = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true } })
		if (!target) return { kind: 'error', reason: 'not-found' }
		const headers = getRequest().headers
		try {
			if (banned) {
				await auth.api.banUser({ body: { userId }, headers })
				// banUser doesn't always revoke sessions; do it explicitly so a signed-in
				// banned user can't keep operating on a live cookie.
				await auth.api.revokeUserSessions({ body: { userId }, headers })
			} else {
				await auth.api.unbanUser({ body: { userId }, headers })
			}
			return { kind: 'ok' }
		} catch (err) {
			return { kind: 'error', reason: 'failed', message: err instanceof Error ? err.message : 'Failed to update ban state' }
		}
	})

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

// ===============================
// Permissions (admin acting on behalf of a user)
// ===============================
// Mirror of the self-service permissions server fns, but the "owner"
// (whose lists' access is being granted) is the user the admin is
// editing rather than the actor. Reuses the shared impls so the
// restricted-on-partner/guardian guard and listEditors cleanup all
// match the self-service path.

export const getUserRelationshipsAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: { userId: string }) => data)
	.handler(({ data }): Promise<Array<RelationshipRow>> => getUsersWithRelationshipsImpl(data.userId))

export const upsertUserRelationshipsAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: { userId: string; input: UpsertUserRelationshipsInput }) => data)
	.handler(
		({ data }): Promise<UpsertUserRelationshipsResult> =>
			upsertUserRelationshipsImpl({ ownerUserId: data.userId, input: data.input, actingAsAdmin: true })
	)

// The reverse direction: the edited user is the VIEWER, and we're granting /
// restricting what THEY can see of every other user's lists. Mirrors the
// self-service `getOwnersWithRelationshipsForMe` / `upsertViewerRelationships`
// pair, with the actor (admin) acting on behalf of the edited user. Used by the
// admin Edit User dialog's "what this user can see of others" editor and by the
// Create User form's default-access bulk write.

export const getOwnerRelationshipsForUserAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: { userId: string }) => data)
	.handler(({ data }): Promise<Array<RelationshipRow>> => getOwnersWithRelationshipsForMeImpl(data.userId))

export const upsertViewerRelationshipsAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: { userId: string; input: UpsertViewerRelationshipsInput }) => data)
	.handler(
		({ data }): Promise<UpsertViewerRelationshipsResult> =>
			upsertViewerRelationshipsImpl({ viewerUserId: data.userId, input: data.input, actingAsAdmin: true })
	)

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
		.innerJoin(items, and(eq(items.id, giftedItems.itemId), visibleItemsWhere('visible')))

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
