// Server-only list-addon implementations. Lives in a separate file
// from `list-addons.ts` so server-only static imports stay out of the
// client bundle.

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db, type SchemaDatabase } from '@/db'
import { listAddons, lists } from '@/db/schema'
import type { ListAddon } from '@/db/schema/lists'
import { httpsUpgradeOrNull } from '@/lib/image-url'
import { notifyListEvent } from '@/lib/list-event-bus'
import { canViewList } from '@/lib/permissions'
import { getAppSettings } from '@/lib/settings-loader'
import { cleanupImageUrls } from '@/lib/storage/cleanup'
import { mirrorRemoteImageForAddon } from '@/lib/storage/mirror'
import { LIMITS } from '@/lib/validation/limits'

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
	// Same shape as items: free-form strings capped at 2000 chars.
	url: z.string().max(2000).optional(),
	imageUrl: z.string().max(2000).optional(),
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
	// See UpdateGiftInputSchema: attachmentUrls is managed only by the
	// dedicated upload/remove server fns; trackingNumber rides through the
	// edit dialog like notes / totalCost.
	trackingNumber: z.string().max(LIMITS.TRACKING_NUMBER).nullable().optional(),
	url: z.string().max(2000).nullable().optional(),
	imageUrl: z.string().max(2000).nullable().optional(),
})

export const ArchiveAddonInputSchema = z.object({
	addonId: z.number().int().positive(),
})

export const DeleteAddonInputSchema = z.object({
	addonId: z.number().int().positive(),
})

// ===============================
// Helpers
// ===============================

// Mirror an external image into our bucket when the deployment asks for it,
// matching items. Returns the original URL on any skip/failure path.
async function maybeMirrorImageForAddon(dbx: SchemaDatabase, addonId: number, imageUrl: string | null): Promise<string | null> {
	if (!imageUrl) return imageUrl
	const settings = await getAppSettings(dbx)
	if (!settings.mirrorExternalImagesOnSave) return imageUrl
	const mirrored = await mirrorRemoteImageForAddon(imageUrl, addonId)
	return mirrored ?? imageUrl
}

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
	// Mirrors the self-claim guard: on a dependent-subject list the recipient
	// is the dependent, so the guardian who owns the list is a normal gifter.
	if (list.ownerId === userId && !list.subjectDependentId) return { kind: 'error', reason: 'cannot-add-to-own-list' }

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
			url: data.url || null,
			imageUrl: httpsUpgradeOrNull(data.imageUrl || null),
		})
		.returning()

	let addon = inserted
	const mirrored = await maybeMirrorImageForAddon(dbx, inserted.id, inserted.imageUrl)
	if (mirrored && mirrored !== inserted.imageUrl) {
		const [withMirror] = await dbx.update(listAddons).set({ imageUrl: mirrored }).where(eq(listAddons.id, inserted.id)).returning()
		addon = withMirror
	}

	notifyListEvent({ kind: 'addon', listId: data.listId, addonId: addon.id, shape: 'added' })
	return { kind: 'ok', addon }
}

export async function updateListAddonImpl(args: {
	userId: string
	input: z.infer<typeof UpdateAddonInputSchema>
	dbx?: SchemaDatabase
}): Promise<UpdateAddonResult> {
	const { userId, input: data, dbx = db } = args

	const existing = await dbx.query.listAddons.findFirst({
		where: eq(listAddons.id, data.addonId),
		columns: { id: true, userId: true, listId: true, imageUrl: true },
	})
	if (!existing) return { kind: 'error', reason: 'not-found' }
	if (existing.userId !== userId) return { kind: 'error', reason: 'not-yours' }

	let nextImageUrl = data.imageUrl
	if (nextImageUrl !== undefined) {
		nextImageUrl = httpsUpgradeOrNull(nextImageUrl || null)
		if (nextImageUrl !== existing.imageUrl) nextImageUrl = await maybeMirrorImageForAddon(dbx, existing.id, nextImageUrl)
	}

	const [updated] = await dbx
		.update(listAddons)
		.set({
			...(data.description !== undefined ? { description: data.description } : {}),
			...(data.notes !== undefined ? { notes: data.notes } : {}),
			...(data.totalCost !== undefined ? { totalCost: data.totalCost } : {}),
			...(data.trackingNumber !== undefined ? { trackingNumber: data.trackingNumber } : {}),
			...(data.url !== undefined ? { url: data.url || null } : {}),
			...(nextImageUrl !== undefined ? { imageUrl: nextImageUrl } : {}),
		})
		.where(eq(listAddons.id, data.addonId))
		.returning()

	// A replaced or cleared image is orphaned; best-effort cleanup after the
	// write, same as items. No-op for URLs we didn't mint.
	if (existing.imageUrl && existing.imageUrl !== updated.imageUrl) {
		void cleanupImageUrls([existing.imageUrl])
	}

	notifyListEvent({ kind: 'addon', listId: existing.listId, addonId: existing.id })
	return { kind: 'ok', addon: updated }
}

export async function archiveListAddonImpl(args: {
	userId: string
	input: z.infer<typeof ArchiveAddonInputSchema>
	dbx?: SchemaDatabase
}): Promise<ArchiveAddonResult> {
	const { userId, input: data, dbx = db } = args

	const existing = await dbx.query.listAddons.findFirst({
		where: eq(listAddons.id, data.addonId),
		columns: { id: true, userId: true, isArchived: true, listId: true },
	})
	if (!existing) return { kind: 'error', reason: 'not-found' }
	if (existing.userId !== userId) return { kind: 'error', reason: 'not-yours' }
	if (existing.isArchived) return { kind: 'error', reason: 'already-archived' }

	await dbx.update(listAddons).set({ isArchived: true }).where(eq(listAddons.id, data.addonId))
	notifyListEvent({ kind: 'addon', listId: existing.listId, addonId: existing.id, shape: 'removed' })
	return { kind: 'ok' }
}

export async function deleteListAddonImpl(args: {
	userId: string
	input: z.infer<typeof DeleteAddonInputSchema>
	dbx?: SchemaDatabase
}): Promise<DeleteAddonResult> {
	const { userId, input: data, dbx = db } = args

	const existing = await dbx.query.listAddons.findFirst({
		where: eq(listAddons.id, data.addonId),
		columns: { id: true, userId: true, listId: true, imageUrl: true },
	})
	if (!existing) return { kind: 'error', reason: 'not-found' }
	if (existing.userId !== userId) return { kind: 'error', reason: 'not-yours' }

	await dbx.delete(listAddons).where(and(eq(listAddons.id, data.addonId), eq(listAddons.userId, userId)))
	// Post-commit storage cleanup, best-effort (same as item delete).
	await cleanupImageUrls([existing.imageUrl])
	notifyListEvent({ kind: 'addon', listId: existing.listId, addonId: existing.id, shape: 'removed' })
	return { kind: 'ok' }
}
