// Profile - the authenticated user's own data, plus the user-picker
// reads that fuel the partner / co-gifter / gift-ideas-recipient
// pickers in the iOS UI.
//
// Password change stays web-only by product decision (see
// `.notes/plans/2026-04-mobile-view-and-claim.md`).

import { and, asc, eq, ne, notInArray } from 'drizzle-orm'
import type { Hono } from 'hono'
import { z } from 'zod'

import { db } from '@/db'
import type { BirthMonth } from '@/db/schema'
import { userRelationships, users } from '@/db/schema'
import { LIMITS } from '@/lib/validation/limits'

import type { MobileAuthContext } from '../auth'
import { jsonError } from '../envelope'

type App = Hono<MobileAuthContext>

const UpdateProfileInputSchema = z.object({
	name: z.string().min(1).max(LIMITS.SHORT_NAME).optional(),
	birthMonth: z.string().max(20).nullable().optional(),
	birthDay: z.number().int().min(1).max(31).nullable().optional(),
	birthYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
	partnerId: z.string().max(LIMITS.SHORT_ID).nullable().optional(),
	image: z.string().nullable().optional(),
})

export function registerProfileRoutes(v1: App): void {
	// GET /v1/me/profile - the authenticated user's full profile,
	// including birthday and partner. Distinct from `GET /v1/me`,
	// whose response shape is frozen byte-identical to the `user`
	// block of `POST /v1/sign-in` (iOS widgets and the share extension
	// cache it). New consumers (MCP, future widgets that need birthday
	// context) should pull from here instead.
	v1.get('/me/profile', async c => {
		const userId = c.get('userId')
		const isAdmin = c.get('userIsAdmin')
		const isChild = c.get('userIsChild')
		const row = await db.query.users.findFirst({
			where: eq(users.id, userId),
			columns: {
				id: true,
				name: true,
				email: true,
				image: true,
				role: true,
				partnerId: true,
				birthMonth: true,
				birthDay: true,
				birthYear: true,
			},
		})
		if (!row) return jsonError(c, 404, 'not-found')
		return c.json({ user: { ...row, isAdmin, isChild } })
	})

	// PATCH /v1/me - update profile (name, image, partner, birthday).
	//
	// Schema diverges from the web's `updateProfileInputSchema`
	// (web requires `name`; mobile makes everything optional for
	// partial-update semantics). The body of this handler mirrors
	// `updateUserProfileImpl` minus the `auth.api.updateUser`
	// cookieCache invalidation, which apiKey auth doesn't need.
	v1.patch('/me', async c => {
		const userId = c.get('userId')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = UpdateProfileInputSchema.safeParse(body)
		if (!parsed.success) return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })

		const me = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { partnerId: true } })
		const currentPartnerId = me?.partnerId ?? null

		const updates: {
			name?: string
			image?: string | null
			birthMonth?: BirthMonth | null
			birthDay?: number | null
			birthYear?: number | null
			partnerId?: string | null
		} = {}
		if (parsed.data.name !== undefined) updates.name = parsed.data.name
		if (parsed.data.image !== undefined) updates.image = parsed.data.image
		if (parsed.data.birthMonth !== undefined) updates.birthMonth = (parsed.data.birthMonth || null) as BirthMonth | null
		if (parsed.data.birthDay !== undefined) updates.birthDay = parsed.data.birthDay ?? null
		if (parsed.data.birthYear !== undefined) updates.birthYear = parsed.data.birthYear ?? null

		const newPartnerId = parsed.data.partnerId !== undefined ? parsed.data.partnerId || null : undefined

		await db.transaction(async tx => {
			if (newPartnerId !== undefined) {
				updates.partnerId = newPartnerId
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
			if (Object.keys(updates).length > 0) {
				await tx.update(users).set(updates).where(eq(users.id, userId))
			}
		})

		const updated = await db.query.users.findFirst({
			where: eq(users.id, userId),
			columns: {
				id: true,
				name: true,
				email: true,
				image: true,
				role: true,
				partnerId: true,
				birthMonth: true,
				birthDay: true,
				birthYear: true,
			},
		})
		return c.json({ user: updated })
	})

	// GET /v1/users/potential-partners - drives the partner picker AND
	// the co-gifter picker (the web reuses this query for both).
	v1.get('/users/potential-partners', async c => {
		const currentUserId = c.get('userId')
		const rows = await db.query.users.findMany({
			where: and(ne(users.id, currentUserId), ne(users.role, 'child')),
			orderBy: [asc(users.name), asc(users.email)],
			columns: { id: true, name: true, email: true, image: true, role: true, partnerId: true },
		})
		return c.json({ users: rows })
	})

	// GET /v1/users/gift-ideas-recipients - for guardians choosing the
	// child a gift-ideas list belongs to.
	v1.get('/users/gift-ideas-recipients', async c => {
		const currentUserId = c.get('userId')
		const blockers = await db
			.select({ ownerUserId: userRelationships.ownerUserId })
			.from(userRelationships)
			.where(and(eq(userRelationships.viewerUserId, currentUserId), eq(userRelationships.accessLevel, 'none')))
		const blockedOwnerIds = blockers.map(b => b.ownerUserId)

		const recipients = await db.query.users.findMany({
			where: and(ne(users.id, currentUserId), blockedOwnerIds.length > 0 ? notInArray(users.id, blockedOwnerIds) : undefined),
			orderBy: [asc(users.name), asc(users.email)],
			columns: { id: true, name: true, email: true, image: true, role: true },
		})
		return c.json({ users: recipients })
	})
}
