// Server-fn surface for list editors. Core CRUD impls live in
// `_list-editors-impl.ts`. The partner-editor helpers
// (getPartnerEditorAffectedLists, applyPartnerEditorChanges) keep
// their inline handler bodies because their server-only references
// are already strip-friendly (they sit inside `.handler()` callbacks).

import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { listEditors, lists, users } from '@/db/schema'
import type { ListType } from '@/db/schema/enums'
import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

import {
	type AddableEditorUser,
	AddEditorInputSchema,
	type AddEditorResult,
	addListEditorImpl,
	type EditorOnList,
	getAddableEditorsImpl,
	getListEditorsImpl,
	RemoveEditorInputSchema,
	type RemoveEditorResult,
	removeListEditorImpl,
} from './_list-editors-impl'

export type { AddableEditorUser, AddEditorResult, EditorOnList, RemoveEditorResult } from './_list-editors-impl'

export const getListEditors = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: { listId: number }) => ({ listId: data.listId }))
	.handler(
		({ context, data }): Promise<Array<EditorOnList>> => getListEditorsImpl({ userId: context.session.user.id, listId: data.listId })
	)

export const addListEditor = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof AddEditorInputSchema>) => AddEditorInputSchema.parse(data))
	.handler(({ context, data }): Promise<AddEditorResult> => addListEditorImpl({ ownerId: context.session.user.id, input: data }))

export const getAddableEditors = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: { listId: number }) => ({ listId: data.listId }))
	.handler(
		({ context, data }): Promise<Array<AddableEditorUser>> =>
			getAddableEditorsImpl({ ownerId: context.session.user.id, listId: data.listId })
	)

export const removeListEditor = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof RemoveEditorInputSchema>) => RemoveEditorInputSchema.parse(data))
	.handler(({ context, data }): Promise<RemoveEditorResult> => removeListEditorImpl({ ownerId: context.session.user.id, input: data }))

// ===============================
// READ - lists affected by a partner change
// ===============================
// Used by the profile form to surface a follow-up "update list editors?"
// prompt after the user adds, swaps, or removes a partner.

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
