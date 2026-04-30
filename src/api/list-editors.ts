import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, inArray, ne, notInArray } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { listEditors, lists, userRelationships, users } from '@/db/schema'
import type { ListType, Role } from '@/db/schema/enums'
import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

// ===============================
// READ - editors for a list
// ===============================
// Returns every user who has list-level editor access. Only the list
// owner should see this; the loader in $listId.edit.tsx gates access.

export type EditorOnList = {
	id: number
	userId: string
	user: {
		id: string
		name: string | null
		email: string
		image: string | null
	}
}

export const getListEditors = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: { listId: number }) => ({ listId: data.listId }))
	.handler(async ({ context, data }): Promise<Array<EditorOnList>> => {
		const userId = context.session.user.id

		// Only the list owner can see the editor list.
		const list = await db.query.lists.findFirst({
			where: eq(lists.id, data.listId),
			columns: { id: true, ownerId: true },
		})
		if (!list || list.ownerId !== userId) return []

		const rows = await db.query.listEditors.findMany({
			where: eq(listEditors.listId, data.listId),
			columns: { id: true, userId: true },
			with: {
				user: {
					columns: { id: true, name: true, email: true, image: true },
				},
			},
		})

		return rows
	})

// ===============================
// WRITE - grant editor access
// ===============================
// Only the list owner can grant. The target user must exist.

const AddEditorInputSchema = z.object({
	listId: z.number().int().positive(),
	userId: z.string().min(1),
})

export type AddEditorResult =
	| { kind: 'ok'; editor: EditorOnList }
	| {
			kind: 'error'
			reason: 'list-not-found' | 'not-owner' | 'user-not-found' | 'already-editor' | 'cannot-add-self' | 'user-is-child'
	  }

export const addListEditor = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof AddEditorInputSchema>) => AddEditorInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<AddEditorResult> => {
		const ownerId = context.session.user.id

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, data.listId),
			columns: { id: true, ownerId: true },
		})
		if (!list) return { kind: 'error', reason: 'list-not-found' }
		if (list.ownerId !== ownerId) return { kind: 'error', reason: 'not-owner' }

		if (data.userId === ownerId) return { kind: 'error', reason: 'cannot-add-self' }

		// Look up the target user.
		const targetUser = await db.query.users.findFirst({
			where: eq(users.id, data.userId),
			columns: { id: true, name: true, email: true, image: true, role: true },
		})
		if (!targetUser) return { kind: 'error', reason: 'user-not-found' }
		if (targetUser.role === 'child') return { kind: 'error', reason: 'user-is-child' }

		// Check for existing grant.
		const existing = await db.query.listEditors.findFirst({
			where: and(eq(listEditors.listId, data.listId), eq(listEditors.userId, targetUser.id)),
			columns: { id: true },
		})
		if (existing) return { kind: 'error', reason: 'already-editor' }

		const [inserted] = await db
			.insert(listEditors)
			.values({
				listId: data.listId,
				userId: targetUser.id,
				ownerId,
			})
			.returning()

		return {
			kind: 'ok',
			editor: {
				id: inserted.id,
				userId: inserted.userId,
				user: {
					id: targetUser.id,
					name: targetUser.name,
					email: targetUser.email,
					image: targetUser.image,
				},
			},
		}
	})

// ===============================
// READ - users eligible to be added as editors
// ===============================
// Returns every user who is not the list owner, not already an editor, and
// not someone the owner has explicitly denied view access to. Includes role
// so the UI can disable child accounts. Only the list owner gets a populated
// list; others receive [].

export type AddableEditorUser = {
	id: string
	name: string | null
	email: string
	image: string | null
	role: Role
}

export const getAddableEditors = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: { listId: number }) => ({ listId: data.listId }))
	.handler(async ({ context, data }): Promise<Array<AddableEditorUser>> => {
		const ownerId = context.session.user.id

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, data.listId),
			columns: { id: true, ownerId: true },
		})
		if (!list || list.ownerId !== ownerId) return []

		const existing = await db.query.listEditors.findMany({
			where: eq(listEditors.listId, data.listId),
			columns: { userId: true },
		})

		const denied = await db.query.userRelationships.findMany({
			where: and(eq(userRelationships.ownerUserId, ownerId), eq(userRelationships.canView, false)),
			columns: { viewerUserId: true },
		})

		const excludedIds = Array.from(new Set([...existing.map(e => e.userId), ...denied.map(d => d.viewerUserId)]))

		const rows = await db.query.users.findMany({
			where: excludedIds.length > 0 ? and(ne(users.id, ownerId), notInArray(users.id, excludedIds)) : ne(users.id, ownerId),
			columns: { id: true, name: true, email: true, image: true, role: true },
			orderBy: [asc(users.name), asc(users.email)],
		})

		return rows
	})

// ===============================
// WRITE - revoke editor access
// ===============================
// Only the list owner can revoke.

const RemoveEditorInputSchema = z.object({
	editorId: z.number().int().positive(),
})

export type RemoveEditorResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-owner' }

export const removeListEditor = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof RemoveEditorInputSchema>) => RemoveEditorInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<RemoveEditorResult> => {
		const ownerId = context.session.user.id

		const existing = await db.query.listEditors.findFirst({
			where: eq(listEditors.id, data.editorId),
			columns: { id: true, ownerId: true },
		})
		if (!existing) return { kind: 'error', reason: 'not-found' }
		if (existing.ownerId !== ownerId) return { kind: 'error', reason: 'not-owner' }

		await db.delete(listEditors).where(eq(listEditors.id, data.editorId))

		return { kind: 'ok' }
	})

// ===============================
// READ - lists affected by a partner change
// ===============================
// Used by the profile form to surface a follow-up "update list editors?"
// prompt after the user adds, swaps, or removes a partner. Operates strictly
// on lists owned by the caller.
//   toAdd:    public, active lists I own where the new partner isn't already
//             an editor (skipped if the new partner is a child or unknown).
//   toRemove: lists I own where the old partner is currently an editor.

export type AffectedList = { id: number; name: string; type: ListType }

const GetPartnerEditorAffectedListsInputSchema = z.object({
	prevPartnerId: z.string().nullable().optional(),
	nextPartnerId: z.string().nullable().optional(),
})

export const getPartnerEditorAffectedLists = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof GetPartnerEditorAffectedListsInputSchema>) => GetPartnerEditorAffectedListsInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<{ toAdd: Array<AffectedList>; toRemove: Array<AffectedList> }> => {
		const userId = context.session.user.id
		const result: { toAdd: Array<AffectedList>; toRemove: Array<AffectedList> } = { toAdd: [], toRemove: [] }

		if (data.nextPartnerId) {
			const nextPartner = await db.query.users.findFirst({
				where: eq(users.id, data.nextPartnerId),
				columns: { id: true, role: true },
			})
			if (nextPartner && nextPartner.role !== 'child') {
				const myPublicLists = await db.query.lists.findMany({
					where: and(eq(lists.ownerId, userId), eq(lists.isPrivate, false), eq(lists.isActive, true)),
					columns: { id: true, name: true, type: true },
					orderBy: [asc(lists.name)],
				})
				if (myPublicLists.length > 0) {
					const existingGrants = await db.query.listEditors.findMany({
						where: and(
							eq(listEditors.userId, data.nextPartnerId),
							inArray(
								listEditors.listId,
								myPublicLists.map(l => l.id)
							)
						),
						columns: { listId: true },
					})
					const taken = new Set(existingGrants.map(e => e.listId))
					result.toAdd = myPublicLists.filter(l => !taken.has(l.id))
				}
			}
		}

		if (data.prevPartnerId) {
			const removeRows = await db
				.select({ listId: listEditors.listId, listName: lists.name, listType: lists.type })
				.from(listEditors)
				.innerJoin(lists, eq(lists.id, listEditors.listId))
				.where(and(eq(listEditors.userId, data.prevPartnerId), eq(lists.ownerId, userId)))
				.orderBy(asc(lists.name))
			result.toRemove = removeRows.map(r => ({ id: r.listId, name: r.listName, type: r.listType }))
		}

		return result
	})

// ===============================
// WRITE - apply a batch of partner editor changes
// ===============================
// Companion to getPartnerEditorAffectedLists. Caller must own every listId
// in addListIds/removeListIds; mismatches are silently skipped. New partner
// must not be a child. Runs the inserts/deletes in a single transaction.

const ApplyPartnerEditorChangesInputSchema = z.object({
	addPartnerId: z.string().nullable().optional(),
	addListIds: z.array(z.number().int().positive()).default([]),
	removePartnerId: z.string().nullable().optional(),
	removeListIds: z.array(z.number().int().positive()).default([]),
})

export type ApplyPartnerEditorChangesResult = { kind: 'ok'; added: number; removed: number }

export const applyPartnerEditorChanges = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ApplyPartnerEditorChangesInputSchema>) => ApplyPartnerEditorChangesInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<ApplyPartnerEditorChangesResult> => {
		const ownerId = context.session.user.id
		let added = 0
		let removed = 0

		await db.transaction(async tx => {
			if (data.addPartnerId && data.addListIds.length > 0) {
				const addPartner = await tx.query.users.findFirst({
					where: eq(users.id, data.addPartnerId),
					columns: { id: true, role: true },
				})
				if (addPartner && addPartner.role !== 'child') {
					const ownedAdds = await tx.query.lists.findMany({
						where: and(eq(lists.ownerId, ownerId), inArray(lists.id, data.addListIds)),
						columns: { id: true },
					})
					if (ownedAdds.length > 0) {
						const inserted = await tx
							.insert(listEditors)
							.values(ownedAdds.map(l => ({ listId: l.id, userId: data.addPartnerId!, ownerId })))
							.onConflictDoNothing()
							.returning({ id: listEditors.id })
						added = inserted.length
					}
				}
			}

			if (data.removePartnerId && data.removeListIds.length > 0) {
				const ownedRemoves = await tx.query.lists.findMany({
					where: and(eq(lists.ownerId, ownerId), inArray(lists.id, data.removeListIds)),
					columns: { id: true },
				})
				if (ownedRemoves.length > 0) {
					const deleted = await tx
						.delete(listEditors)
						.where(
							and(
								eq(listEditors.userId, data.removePartnerId),
								inArray(
									listEditors.listId,
									ownedRemoves.map(l => l.id)
								)
							)
						)
						.returning({ id: listEditors.id })
					removed = deleted.length
				}
			}
		})

		return { kind: 'ok', added, removed }
	})
