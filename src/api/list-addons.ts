import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { listAddons, lists } from '@/db/schema'
import type { ListAddon } from '@/db/schema/lists'
import { canViewList } from '@/lib/permissions'
import { authMiddleware } from '@/middleware/auth'

// ===============================
// WRITE — create an off-list gift (addon)
// ===============================
// Addons are visible only to gifters (spoiler protection same as claims).
// The list owner can't see them. Any viewer who is NOT the owner can add one.

const CreateAddonInputSchema = z.object({
	listId: z.number().int().positive(),
	description: z.string().min(1, 'Description is required').max(500),
	notes: z.string().max(2000).optional(),
	totalCost: z
		.union([z.string().regex(/^\d+(\.\d{1,2})?$/), z.number().nonnegative()])
		.optional()
		.transform(v => (v === undefined ? undefined : typeof v === 'number' ? v.toFixed(2) : v)),
})

export type CreateAddonResult =
	| { kind: 'ok'; addon: ListAddon }
	| { kind: 'error'; reason: 'list-not-found' | 'not-visible' | 'cannot-add-to-own-list' }

export const createListAddon = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof CreateAddonInputSchema>) => CreateAddonInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<CreateAddonResult> => {
		const userId = context.session.user.id

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, data.listId),
			columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
		})
		if (!list) return { kind: 'error', reason: 'list-not-found' }
		if (list.ownerId === userId) return { kind: 'error', reason: 'cannot-add-to-own-list' }

		const view = await canViewList(userId, list)
		if (!view.ok) return { kind: 'error', reason: 'not-visible' }

		const [inserted] = await db
			.insert(listAddons)
			.values({
				listId: data.listId,
				userId,
				description: data.description,
				notes: data.notes ?? null,
				totalCost: data.totalCost ?? null,
			})
			.returning()

		return { kind: 'ok', addon: inserted }
	})

// ===============================
// WRITE — update an addon
// ===============================
// Only the user who created the addon can edit it. No lock needed — addons
// have no quantity invariant.

const UpdateAddonInputSchema = z.object({
	addonId: z.number().int().positive(),
	description: z.string().min(1, 'Description is required').max(500).optional(),
	notes: z.string().max(2000).nullable().optional(),
	totalCost: z
		.union([z.string().regex(/^\d+(\.\d{1,2})?$/), z.number().nonnegative()])
		.nullable()
		.optional()
		.transform(v => (v === undefined || v === null ? v : typeof v === 'number' ? v.toFixed(2) : v)),
})

export type UpdateAddonResult = { kind: 'ok'; addon: ListAddon } | { kind: 'error'; reason: 'not-found' | 'not-yours' }

export const updateListAddon = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof UpdateAddonInputSchema>) => UpdateAddonInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<UpdateAddonResult> => {
		const userId = context.session.user.id

		const existing = await db.query.listAddons.findFirst({
			where: eq(listAddons.id, data.addonId),
			columns: { id: true, userId: true },
		})
		if (!existing) return { kind: 'error', reason: 'not-found' }
		if (existing.userId !== userId) return { kind: 'error', reason: 'not-yours' }

		const [updated] = await db
			.update(listAddons)
			.set({
				...(data.description !== undefined ? { description: data.description } : {}),
				...(data.notes !== undefined ? { notes: data.notes } : {}),
				...(data.totalCost !== undefined ? { totalCost: data.totalCost } : {}),
			})
			.where(eq(listAddons.id, data.addonId))
			.returning()

		return { kind: 'ok', addon: updated }
	})

// ===============================
// WRITE — archive an addon ("mark as given")
// ===============================
// Archives the addon so it surfaces on the recipient's "received gifts"
// page. This is a one-way state change in the current design. Only the
// addon creator can archive it.

const ArchiveAddonInputSchema = z.object({
	addonId: z.number().int().positive(),
})

export type ArchiveAddonResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-yours' | 'already-archived' }

export const archiveListAddon = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof ArchiveAddonInputSchema>) => ArchiveAddonInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<ArchiveAddonResult> => {
		const userId = context.session.user.id

		const existing = await db.query.listAddons.findFirst({
			where: eq(listAddons.id, data.addonId),
			columns: { id: true, userId: true, isArchived: true },
		})
		if (!existing) return { kind: 'error', reason: 'not-found' }
		if (existing.userId !== userId) return { kind: 'error', reason: 'not-yours' }
		if (existing.isArchived) return { kind: 'error', reason: 'already-archived' }

		await db.update(listAddons).set({ isArchived: true }).where(eq(listAddons.id, data.addonId))

		return { kind: 'ok' }
	})

// ===============================
// WRITE — delete an addon (hard delete)
// ===============================
// Full retraction: "I misclicked, make it go away." Only the addon creator
// can delete it.

const DeleteAddonInputSchema = z.object({
	addonId: z.number().int().positive(),
})

export type DeleteAddonResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-yours' }

export const deleteListAddon = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof DeleteAddonInputSchema>) => DeleteAddonInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<DeleteAddonResult> => {
		const userId = context.session.user.id

		const existing = await db.query.listAddons.findFirst({
			where: eq(listAddons.id, data.addonId),
			columns: { id: true, userId: true },
		})
		if (!existing) return { kind: 'error', reason: 'not-found' }
		if (existing.userId !== userId) return { kind: 'error', reason: 'not-yours' }

		await db.delete(listAddons).where(and(eq(listAddons.id, data.addonId), eq(listAddons.userId, userId)))

		return { kind: 'ok' }
	})
