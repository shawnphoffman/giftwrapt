// Server-only list-addon implementations. Lives in a separate file
// from `list-addons.ts` so server-only static imports stay out of the
// client bundle.

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db, type SchemaDatabase } from '@/db'
import { listAddons, lists } from '@/db/schema'
import type { ListAddon } from '@/db/schema/lists'
import { canViewList } from '@/lib/permissions'
import { notifyListEvent } from '@/routes/api/sse/list.$listId'

// ===============================
// Public types
// ===============================

export type CreateAddonResult =
	| { kind: 'ok'; addon: ListAddon }
	| { kind: 'error'; reason: 'list-not-found' | 'not-visible' | 'cannot-add-to-own-list' }

export type UpdateAddonResult = { kind: 'ok'; addon: ListAddon } | { kind: 'error'; reason: 'not-found' | 'not-yours' }

export type ArchiveAddonResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-yours' | 'already-archived' }

export type DeleteAddonResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-yours' }

// ===============================
// Input schemas
// ===============================

export const CreateAddonInputSchema = z.object({
	listId: z.number().int().positive(),
	description: z.string().min(1, 'Description is required').max(500),
	notes: z.string().max(2000).optional(),
	totalCost: z
		.union([z.string().regex(/^\d+(\.\d{1,2})?$/), z.number().nonnegative()])
		.optional()
		.transform(v => (v === undefined ? undefined : typeof v === 'number' ? v.toFixed(2) : v)),
})

export const UpdateAddonInputSchema = z.object({
	addonId: z.number().int().positive(),
	description: z.string().min(1, 'Description is required').max(500).optional(),
	notes: z.string().max(2000).nullable().optional(),
	totalCost: z
		.union([z.string().regex(/^\d+(\.\d{1,2})?$/), z.number().nonnegative()])
		.nullable()
		.optional()
		.transform(v => (v === undefined || v === null ? v : typeof v === 'number' ? v.toFixed(2) : v)),
})

export const ArchiveAddonInputSchema = z.object({
	addonId: z.number().int().positive(),
})

export const DeleteAddonInputSchema = z.object({
	addonId: z.number().int().positive(),
})

// ===============================
// Impls
// ===============================

export async function createListAddonImpl(args: {
	userId: string
	input: z.infer<typeof CreateAddonInputSchema>
	dbx?: SchemaDatabase
}): Promise<CreateAddonResult> {
	const { userId, input: data, dbx = db } = args

	const list = await dbx.query.lists.findFirst({
		where: eq(lists.id, data.listId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { kind: 'error', reason: 'list-not-found' }
	if (list.ownerId === userId) return { kind: 'error', reason: 'cannot-add-to-own-list' }

	const view = await canViewList(userId, list, dbx)
	if (!view.ok) return { kind: 'error', reason: 'not-visible' }

	const [inserted] = await dbx
		.insert(listAddons)
		.values({
			listId: data.listId,
			userId,
			description: data.description,
			notes: data.notes ?? null,
			totalCost: data.totalCost ?? null,
		})
		.returning()

	notifyListEvent({ kind: 'addon', listId: data.listId, addonId: inserted.id, shape: 'added' })
	return { kind: 'ok', addon: inserted }
}

export async function updateListAddonImpl(args: {
	userId: string
	input: z.infer<typeof UpdateAddonInputSchema>
}): Promise<UpdateAddonResult> {
	const { userId, input: data } = args

	const existing = await db.query.listAddons.findFirst({
		where: eq(listAddons.id, data.addonId),
		columns: { id: true, userId: true, listId: true },
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

	notifyListEvent({ kind: 'addon', listId: existing.listId, addonId: existing.id })
	return { kind: 'ok', addon: updated }
}

export async function archiveListAddonImpl(args: {
	userId: string
	input: z.infer<typeof ArchiveAddonInputSchema>
}): Promise<ArchiveAddonResult> {
	const { userId, input: data } = args

	const existing = await db.query.listAddons.findFirst({
		where: eq(listAddons.id, data.addonId),
		columns: { id: true, userId: true, isArchived: true, listId: true },
	})
	if (!existing) return { kind: 'error', reason: 'not-found' }
	if (existing.userId !== userId) return { kind: 'error', reason: 'not-yours' }
	if (existing.isArchived) return { kind: 'error', reason: 'already-archived' }

	await db.update(listAddons).set({ isArchived: true }).where(eq(listAddons.id, data.addonId))
	notifyListEvent({ kind: 'addon', listId: existing.listId, addonId: existing.id, shape: 'removed' })
	return { kind: 'ok' }
}

export async function deleteListAddonImpl(args: {
	userId: string
	input: z.infer<typeof DeleteAddonInputSchema>
}): Promise<DeleteAddonResult> {
	const { userId, input: data } = args

	const existing = await db.query.listAddons.findFirst({
		where: eq(listAddons.id, data.addonId),
		columns: { id: true, userId: true, listId: true },
	})
	if (!existing) return { kind: 'error', reason: 'not-found' }
	if (existing.userId !== userId) return { kind: 'error', reason: 'not-yours' }

	await db.delete(listAddons).where(and(eq(listAddons.id, data.addonId), eq(listAddons.userId, userId)))
	notifyListEvent({ kind: 'addon', listId: existing.listId, addonId: existing.id, shape: 'removed' })
	return { kind: 'ok' }
}
