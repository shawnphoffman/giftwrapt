// Profile - the authenticated user's own data (read + partial update),
// consumed by MCP.
//
// Password change stays web-only by product decision (see
// `docs/architecture/mobile-api.md`).

import { eq } from 'drizzle-orm'
import type { Hono } from 'hono'
import { z } from 'zod'

import { db } from '@/db'
import type { BirthMonth } from '@/db/schema'
import { users } from '@/db/schema'
import { applyPartnerAndAnniversary, ChildPartnerError } from '@/lib/partner-update'
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
	partnerAnniversary: z.union([z.iso.date(), z.literal(''), z.null()]).optional(),
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
				partnerAnniversary: true,
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
			partnerAnniversary?: string | null
		} = {}
		if (parsed.data.name !== undefined) updates.name = parsed.data.name
		if (parsed.data.image !== undefined) updates.image = parsed.data.image
		if (parsed.data.birthMonth !== undefined) updates.birthMonth = (parsed.data.birthMonth || null) as BirthMonth | null
		if (parsed.data.birthDay !== undefined) updates.birthDay = parsed.data.birthDay ?? null
		if (parsed.data.birthYear !== undefined) updates.birthYear = parsed.data.birthYear ?? null

		const newPartnerId = parsed.data.partnerId !== undefined ? parsed.data.partnerId || null : undefined
		const newAnniversary = parsed.data.partnerAnniversary !== undefined ? parsed.data.partnerAnniversary || null : undefined

		try {
			await db.transaction(async tx => {
				// Children cannot have a partner (either side) - enforced inside
				// the helper, which throws ChildPartnerError.
				const { selfUpdates } = await applyPartnerAndAnniversary(tx, {
					userId,
					currentPartnerId,
					newPartnerId,
					newAnniversary,
				})
				Object.assign(updates, selfUpdates)
				if (Object.keys(updates).length > 0) {
					await tx.update(users).set(updates).where(eq(users.id, userId))
				}
			})
		} catch (err) {
			if (err instanceof ChildPartnerError) return jsonError(c, 403, 'child-cannot-have-partner')
			throw err
		}

		const updated = await db.query.users.findFirst({
			where: eq(users.id, userId),
			columns: {
				id: true,
				name: true,
				email: true,
				image: true,
				role: true,
				partnerId: true,
				partnerAnniversary: true,
				birthMonth: true,
				birthDay: true,
				birthYear: true,
			},
		})
		return c.json({ user: updated })
	})
}
