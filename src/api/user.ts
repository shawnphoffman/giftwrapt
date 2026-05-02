import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, asc, eq, ne, notInArray } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import type { BirthMonth } from '@/db/schema'
import { userRelationships, users } from '@/db/schema'
import { auth } from '@/lib/auth'
import { loggingMiddleware } from '@/lib/logger'
import { LIMITS } from '@/lib/validation/limits'
import { authMiddleware } from '@/middleware/auth'

const updateProfileInputSchema = z.object({
	name: z.string().min(1).max(LIMITS.SHORT_NAME),
	birthMonth: z.string().max(20).nullable().optional(),
	birthDay: z.number().int().min(1).max(31).nullable().optional(),
	birthYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
	partnerId: z.string().max(LIMITS.SHORT_ID).nullable().optional(),
})

const updatePasswordInputSchema = z.object({
	currentPassword: z.string().min(1).max(LIMITS.PASSWORD),
	newPassword: z.string().min(8).max(LIMITS.PASSWORD),
})

// Get potential partners for the current user (non-child users excluding current user)
export const getPotentialPartners = createServerFn({
	method: 'GET',
})
	.middleware([authMiddleware, loggingMiddleware])
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
				partnerId: true,
			},
		})

		return potentialPartners
	})

// Get recipients eligible for a gift-ideas list: anyone the current user could
// plausibly buy gifts for, i.e. any user except themselves and anyone who has
// explicitly hidden their lists from the current user.
export const getGiftIdeasRecipients = createServerFn({
	method: 'GET',
})
	.middleware([authMiddleware, loggingMiddleware])
	.handler(async ({ context }) => {
		const currentUserId = context.session.user.id

		const blockers = await db
			.select({ ownerUserId: userRelationships.ownerUserId })
			.from(userRelationships)
			.where(and(eq(userRelationships.viewerUserId, currentUserId), eq(userRelationships.canView, false)))
		const blockedOwnerIds = blockers.map(b => b.ownerUserId)

		const recipients = await db.query.users.findMany({
			where: and(ne(users.id, currentUserId), blockedOwnerIds.length > 0 ? notInArray(users.id, blockedOwnerIds) : undefined),
			orderBy: [asc(users.name), asc(users.email)],
			columns: {
				id: true,
				name: true,
				email: true,
				image: true,
				role: true,
			},
		})

		return recipients
	})

// Update user profile.
//
// Why the body is inline (not extracted to a top-level `*Impl`): this
// handler references `auth.api.updateUser`, which lives in
// `@/lib/auth.ts`. That module evaluates `env.TRUSTED_ORIGINS` at top
// level. As long as the `auth` reference stays inside the
// `.handler(...)` callback, TanStack Start's strip removes it from the
// client bundle and Rollup tree-shakes the `auth` import. Lifting it
// into a top-level `*Impl` function keeps the reference alive (the
// strip only touches handler bodies), the import survives, and the
// client bundle blows up at first paint with t3-env's "server-side
// variable on the client" guard. Same trap to avoid in any other
// `src/api/*.ts` file that touches `@/lib/auth` (or another
// top-level-env-reading module).
export const updateUserProfile = createServerFn({
	method: 'POST',
})
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.infer<typeof updateProfileInputSchema>) => updateProfileInputSchema.parse(data))
	.handler(async ({ context, data }) => {
		const userId = context.session.user.id
		const currentPartnerId = context.session.user.partnerId || null

		const updateData: {
			name?: string
			birthMonth?: BirthMonth | null
			birthDay?: number | null
			birthYear?: number | null
			partnerId?: string | null
		} = {}

		updateData.name = data.name
		if (data.birthMonth !== undefined) {
			updateData.birthMonth = (data.birthMonth || null) as BirthMonth | null
		}
		if (data.birthDay !== undefined) {
			updateData.birthDay = data.birthDay ?? null
		}
		if (data.birthYear !== undefined) {
			updateData.birthYear = data.birthYear ?? null
		}

		const newPartnerId = data.partnerId !== undefined ? data.partnerId || null : undefined

		const result = await db.transaction(async tx => {
			if (newPartnerId !== undefined) {
				updateData.partnerId = newPartnerId
				if (currentPartnerId && currentPartnerId !== newPartnerId) {
					await tx.update(users).set({ partnerId: null }).where(eq(users.id, currentPartnerId))
				}
				if (newPartnerId) {
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
				...(data.birthYear !== undefined && { birthYear: data.birthYear ?? null }),
				...(newPartnerId !== undefined && { partnerId: newPartnerId }),
			},
			headers: getRequestHeaders(),
		})

		return { success: true, rowsUpdated: result.rowCount }
	})

export { updateProfileInputSchema as UpdateProfileInputSchema }

// Update user password
export const updateUserPassword = createServerFn({
	method: 'POST',
})
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.infer<typeof updatePasswordInputSchema>) => updatePasswordInputSchema.parse(data))
	.handler(async ({ data }) => {
		// Better Auth's changePassword throws on failure
		await auth.api.changePassword({
			body: {
				currentPassword: data.currentPassword,
				newPassword: data.newPassword,
			},
			headers: getRequestHeaders(),
		})

		return { success: true }
	})
