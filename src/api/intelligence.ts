import { createServerFn } from '@tanstack/react-start'
import { and, count, eq, inArray, max } from 'drizzle-orm'
import { z } from 'zod'

import { db, type SchemaDatabase } from '@/db'
import {
	customHolidays,
	dependentGuardianships,
	giftedItems,
	itemGroups,
	items,
	listAddons,
	lists,
	recommendations,
	recommendationSubItemDismissals,
	users,
} from '@/db/schema'
import { listTypeEnumValues } from '@/db/schema/enums'
import { visibleItemsWhere } from '@/lib/item-visibility'
import { isCrossTypeMoveDestructive } from '@/lib/list-type-moves'
import { loggingMiddleware } from '@/lib/logger'
import { canEditListAsAnyone } from '@/lib/permissions'
import { intelligenceRefreshLimiter } from '@/lib/rate-limits'
import { isListTypeDisabled } from '@/lib/settings'
// `getAppSettings` is imported lazily inside every call site below so the
// `settings-loader -> crypto/app-secret -> node:crypto` chain stays out
// of the client graph (server-fn surface; the splitter can't elide a
// static import here once any top-level helper references it).
import { authMiddleware } from '@/middleware/auth'
import { rateLimit } from '@/middleware/rate-limit'

import {
	dismissRecommendationImpl,
	getMyRecommendationsImpl,
	reactivateRecommendationImpl,
	refreshMyRecommendationsImpl,
} from './_intelligence-impl'

export type { IntelligenceDependentRecGroup, IntelligencePagePayload, IntelligenceRecRow } from './_intelligence-impl'

// ─── Read: get my recommendations ───────────────────────────────────────────

export const getMyRecommendations = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(async ({ context }) => getMyRecommendationsImpl(context.session.user.id))

// ─── Read: active rec count (sidebar gate) ──────────────────────────────────
//
// Tiny endpoint for the sidebar to decide whether to show the Suggestions
// link. Returns 0 when the feature is disabled so the sidebar treats
// "feature off" the same as "no active recs" — either way, no link.

export const getMyActiveRecommendationCount = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const userId = context.session.user.id
		const { getAppSettings } = await import('@/lib/settings-loader')
		const settings = await getAppSettings(db)
		if (!settings.intelligenceEnabled) return { count: 0 }
		const rows = await db
			.select({ n: count() })
			.from(recommendations)
			.where(and(eq(recommendations.userId, userId), eq(recommendations.status, 'active')))
		return { count: rows[0]?.n ?? 0 }
	})

// ─── Mutate: refresh ────────────────────────────────────────────────────────

export const refreshMyRecommendations = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, rateLimit(intelligenceRefreshLimiter), loggingMiddleware])
	.handler(async ({ context }) => refreshMyRecommendationsImpl(context.session.user.id))

// ─── Mutate: dismiss / un-dismiss ───────────────────────────────────────────

const recIdSchema = z.object({ id: z.uuid() })

export const dismissRecommendation = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof recIdSchema>) => recIdSchema.parse(data))
	.handler(async ({ context, data }) => dismissRecommendationImpl(context.session.user.id, data.id))

// Dismisses a single sub-item from a bundled rec. The bundle itself stays
// active; the sub-item is hidden from rendering and won't come back unless
// the underlying item leaves and re-enters the bundle (prune-on-regen).
const subItemDismissSchema = z.object({ id: z.uuid(), subItemId: z.string().min(1) })

export const dismissRecommendationSubItem = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof subItemDismissSchema>) => subItemDismissSchema.parse(data))
	.handler(async ({ context, data }) => {
		const userId = context.session.user.id
		const rec = await db.query.recommendations.findFirst({
			where: and(eq(recommendations.id, data.id), eq(recommendations.userId, userId)),
			columns: { id: true, fingerprint: true },
		})
		if (!rec) return { ok: false as const, reason: 'rec-not-found' as const }
		await db
			.insert(recommendationSubItemDismissals)
			.values({ userId, fingerprint: rec.fingerprint, subItemId: data.subItemId })
			.onConflictDoNothing()
		return { ok: true as const }
	})

// Inverse of dismiss: flips the rec back to `active`. Without this,
// dismissal stickiness (see notes/logic.md) plus retention sweeps make a
// dismissed rec effectively unrecoverable, which is a footgun when the
// user dismissed by accident.
export const reactivateRecommendation = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof recIdSchema>) => recIdSchema.parse(data))
	.handler(async ({ context, data }) => reactivateRecommendationImpl(context.session.user.id, data.id))

// ─── Mutate: apply a recommendation action ──────────────────────────────────
//
// Routes by `apply.kind` and runs each branch inside one DB transaction so
// the rec status flips alongside the data change. Any precondition failure
// (rec stale, edit denied, items moved, claims appeared) returns a structured
// error and the rec stays `active` so the user can dismiss it explicitly.

const createGroupApplySchema = z.object({
	kind: z.literal('create-group'),
	listId: z.string(),
	groupType: z.enum(['or', 'order']),
	itemIds: z.array(z.string()).min(2),
	priority: z.enum(['very-high', 'high', 'normal', 'low']),
})

const addToGroupApplySchema = z.object({
	kind: z.literal('add-to-group'),
	listId: z.string(),
	groupId: z.string(),
	itemIds: z.array(z.string()).min(1),
})

const deleteItemsApplySchema = z.object({
	kind: z.literal('delete-items'),
	listId: z.string(),
	itemIds: z.array(z.string()).min(1),
})

const setPrimaryListApplySchema = z.object({
	kind: z.literal('set-primary-list'),
	listId: z.string(),
})

const convertListApplySchema = z.object({
	kind: z.literal('convert-list'),
	listId: z.string(),
	newType: z.enum(listTypeEnumValues),
	newName: z.string().min(1).max(200).optional(),
	newCustomHolidayId: z.string().nullable().optional(),
})

const changeListPrivacyApplySchema = z.object({
	kind: z.literal('change-list-privacy'),
	listId: z.string(),
	isPrivate: z.boolean(),
})

const createListApplySchema = z.object({
	kind: z.literal('create-list'),
	type: z.enum(listTypeEnumValues),
	name: z.string().min(1).max(200),
	isPrivate: z.boolean(),
	setAsPrimary: z.boolean(),
	customHolidayId: z.string().nullable().optional(),
	subjectDependentId: z.string().nullable().optional(),
})

const mergeListsApplySchema = z.object({
	kind: z.literal('merge-lists'),
	survivorListId: z.string(),
	sourceListIds: z.array(z.string()).min(1),
})

const archiveListApplySchema = z.object({
	kind: z.literal('archive-list'),
	listId: z.string(),
})

export const applyInputSchema = z.object({
	id: z.uuid(),
	apply: z.discriminatedUnion('kind', [
		createGroupApplySchema,
		addToGroupApplySchema,
		deleteItemsApplySchema,
		setPrimaryListApplySchema,
		convertListApplySchema,
		changeListPrivacyApplySchema,
		createListApplySchema,
		mergeListsApplySchema,
		archiveListApplySchema,
	]),
})

export type ApplyRecommendationResult =
	| { ok: true; kind: 'create-group'; groupId: string }
	| { ok: true; kind: 'add-to-group'; groupId: string }
	| { ok: true; kind: 'delete-items'; deletedCount: number }
	| { ok: true; kind: 'set-primary-list'; primaryListId: string }
	| { ok: true; kind: 'convert-list'; listId: string }
	| { ok: true; kind: 'change-list-privacy'; listId: string }
	| { ok: true; kind: 'create-list'; listId: string; setPrimary: boolean }
	| { ok: true; kind: 'merge-lists'; survivorListId: string; archivedSourceListIds: Array<string> }
	| { ok: true; kind: 'archive-list'; listId: string }
	| {
			ok: false
			reason:
				| 'rec-not-found'
				| 'rec-not-active'
				| 'list-not-found'
				| 'cannot-edit'
				| 'items-changed'
				| 'items-have-claims'
				| 'invalid-list-type'
				| 'not-owner'
				| 'unknown-apply-kind'
				| 'list-type-disabled'
				| 'todo-list-type-locked'
				| 'invalid-holiday-selection'
				| 'not-dependent-guardian'
				| 'child-cannot-create-gift-ideas'
				| 'no-change'
				| 'merge-cluster-mismatch'
				| 'merge-cross-type-destructive'
	  }

// Reusable impl that any caller (server fn, integration tests, future
// background workers) can invoke against a transaction. Auth + input
// parsing is the server-fn wrapper's job.
export async function applyRecommendationImpl(
	tx: SchemaDatabase,
	userId: string,
	input: z.infer<typeof applyInputSchema>
): Promise<ApplyRecommendationResult> {
	const rec = await tx.query.recommendations.findFirst({
		where: and(eq(recommendations.id, input.id), eq(recommendations.userId, userId)),
		columns: { id: true, status: true },
	})
	if (!rec) return { ok: false, reason: 'rec-not-found' }
	if (rec.status !== 'active') return { ok: false, reason: 'rec-not-active' }

	switch (input.apply.kind) {
		case 'create-group':
			return await applyCreateGroup(tx, userId, input.id, input.apply)
		case 'add-to-group':
			return await applyAddToGroup(tx, userId, input.id, input.apply)
		case 'delete-items':
			return await applyDeleteItems(tx, userId, input.id, input.apply)
		case 'set-primary-list':
			return await applySetPrimaryList(tx, userId, input.id, input.apply)
		case 'convert-list':
			return await applyConvertList(tx, userId, input.id, input.apply)
		case 'change-list-privacy':
			return await applyChangeListPrivacy(tx, userId, input.id, input.apply)
		case 'create-list':
			return await applyCreateList(tx, userId, input.id, input.apply)
		case 'merge-lists':
			return await applyMergeLists(tx, userId, input.id, input.apply)
		case 'archive-list':
			return await applyArchiveList(tx, userId, input.id, input.apply)
	}
}

async function applyCreateGroup(
	tx: SchemaDatabase,
	userId: string,
	recId: string,
	apply: z.infer<typeof createGroupApplySchema>
): Promise<ApplyRecommendationResult> {
	const listIdNum = Number.parseInt(apply.listId, 10)
	const itemIdNums = apply.itemIds.map(id => Number.parseInt(id, 10))
	if (!Number.isFinite(listIdNum) || itemIdNums.some(n => !Number.isFinite(n))) {
		return { ok: false, reason: 'items-changed' }
	}

	const list = await tx.query.lists.findFirst({
		where: eq(lists.id, listIdNum),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { ok: false, reason: 'list-not-found' }

	const editGate = await canEditListAsAnyone(userId, list, tx)
	if (!editGate.ok) return { ok: false, reason: 'cannot-edit' }

	const itemRows = await tx
		.select({
			id: items.id,
			groupId: items.groupId,
			listId: items.listId,
			isArchived: items.isArchived,
			pendingDeletionAt: items.pendingDeletionAt,
		})
		.from(items)
		.where(inArray(items.id, itemIdNums))
	if (itemRows.length !== itemIdNums.length) return { ok: false, reason: 'items-changed' }
	for (const row of itemRows) {
		if (row.listId !== listIdNum) return { ok: false, reason: 'items-changed' }
		if (row.isArchived) return { ok: false, reason: 'items-changed' }
		if (row.pendingDeletionAt !== null) return { ok: false, reason: 'items-changed' }
		if (row.groupId !== null) return { ok: false, reason: 'items-changed' }
	}

	const inserted = await tx
		.insert(itemGroups)
		.values({ listId: listIdNum, type: apply.groupType, priority: apply.priority })
		.returning({ id: itemGroups.id })
	const newGroupId = inserted[0].id

	for (let i = 0; i < itemIdNums.length; i++) {
		await tx.update(items).set({ groupId: newGroupId, groupSortOrder: i }).where(eq(items.id, itemIdNums[i]))
	}

	await tx.update(recommendations).set({ status: 'applied' }).where(eq(recommendations.id, recId))
	return { ok: true, kind: 'create-group', groupId: String(newGroupId) }
}

// Appends ungrouped items to an existing group, after its current
// members. Same item preconditions as create-group. Claims on the group
// are deliberately not consulted: the recipient can't see them, and
// joining an "or" group whose sibling is claimed is exactly what the
// recipient asked for (they wanted one of these).
async function applyAddToGroup(
	tx: SchemaDatabase,
	userId: string,
	recId: string,
	apply: z.infer<typeof addToGroupApplySchema>
): Promise<ApplyRecommendationResult> {
	const listIdNum = Number.parseInt(apply.listId, 10)
	const groupIdNum = Number.parseInt(apply.groupId, 10)
	const itemIdNums = apply.itemIds.map(id => Number.parseInt(id, 10))
	if (!Number.isFinite(listIdNum) || !Number.isFinite(groupIdNum) || itemIdNums.some(n => !Number.isFinite(n))) {
		return { ok: false, reason: 'items-changed' }
	}

	const list = await tx.query.lists.findFirst({
		where: eq(lists.id, listIdNum),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { ok: false, reason: 'list-not-found' }
	const editGate = await canEditListAsAnyone(userId, list, tx)
	if (!editGate.ok) return { ok: false, reason: 'cannot-edit' }

	const group = await tx.query.itemGroups.findFirst({
		where: and(eq(itemGroups.id, groupIdNum), eq(itemGroups.listId, listIdNum)),
		columns: { id: true },
	})
	if (!group) return { ok: false, reason: 'items-changed' }

	const itemRows = await tx
		.select({
			id: items.id,
			groupId: items.groupId,
			listId: items.listId,
			isArchived: items.isArchived,
			pendingDeletionAt: items.pendingDeletionAt,
		})
		.from(items)
		.where(inArray(items.id, itemIdNums))
	if (itemRows.length !== itemIdNums.length) return { ok: false, reason: 'items-changed' }
	for (const row of itemRows) {
		if (row.listId !== listIdNum) return { ok: false, reason: 'items-changed' }
		if (row.isArchived) return { ok: false, reason: 'items-changed' }
		if (row.pendingDeletionAt !== null) return { ok: false, reason: 'items-changed' }
		if (row.groupId !== null) return { ok: false, reason: 'items-changed' }
	}

	const [{ maxOrder }] = await tx
		.select({ maxOrder: max(items.groupSortOrder) })
		.from(items)
		.where(eq(items.groupId, groupIdNum))
	const start = (maxOrder ?? -1) + 1
	for (let i = 0; i < itemIdNums.length; i++) {
		await tx
			.update(items)
			.set({ groupId: groupIdNum, groupSortOrder: start + i })
			.where(eq(items.id, itemIdNums[i]))
	}

	await tx.update(recommendations).set({ status: 'applied' }).where(eq(recommendations.id, recId))
	return { ok: true, kind: 'add-to-group', groupId: String(groupIdNum) }
}

// Hard-deletes items the rec flagged. Refuses if any item has gained a
// claim since the rec was generated - the rec body promises "no gifters
// are affected", so any claim invalidates that promise.
async function applyDeleteItems(
	tx: SchemaDatabase,
	userId: string,
	recId: string,
	apply: z.infer<typeof deleteItemsApplySchema>
): Promise<ApplyRecommendationResult> {
	const listIdNum = Number.parseInt(apply.listId, 10)
	const itemIdNums = apply.itemIds.map(id => Number.parseInt(id, 10))
	if (!Number.isFinite(listIdNum) || itemIdNums.some(n => !Number.isFinite(n))) {
		return { ok: false, reason: 'items-changed' }
	}

	const list = await tx.query.lists.findFirst({
		where: eq(lists.id, listIdNum),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { ok: false, reason: 'list-not-found' }

	const editGate = await canEditListAsAnyone(userId, list, tx)
	if (!editGate.ok) return { ok: false, reason: 'cannot-edit' }

	const itemRows = await tx.select({ id: items.id, listId: items.listId }).from(items).where(inArray(items.id, itemIdNums))
	if (itemRows.length !== itemIdNums.length) return { ok: false, reason: 'items-changed' }
	for (const row of itemRows) {
		if (row.listId !== listIdNum) return { ok: false, reason: 'items-changed' }
	}

	const claims = await tx.select({ itemId: giftedItems.itemId }).from(giftedItems).where(inArray(giftedItems.itemId, itemIdNums)).limit(1)
	if (claims.length > 0) return { ok: false, reason: 'items-have-claims' }

	await tx.delete(items).where(inArray(items.id, itemIdNums))

	// stale-items emits one delete action per item when the rec covers
	// multiple items. Applying a single delete shouldn't dismiss the whole
	// rec; the remaining items still need review. Patch the payload in
	// place: drop the deleted item refs and their matching delete actions.
	// Only mark applied when nothing's left to act on.
	await pruneDeletedItemsFromRecPayload(tx, recId, new Set(apply.itemIds))

	return { ok: true, kind: 'delete-items', deletedCount: itemIdNums.length }
}

type StaleItemsPayload = {
	relatedItems?: Array<{ id: string } & Record<string, unknown>>
	affected?: { noun?: string; count?: number; lines?: Array<string>; [k: string]: unknown }
	actions?: Array<{ apply?: { kind?: string; itemIds?: Array<string> } } & Record<string, unknown>>
	[k: string]: unknown
}

async function pruneDeletedItemsFromRecPayload(tx: SchemaDatabase, recId: string, deletedIds: Set<string>): Promise<void> {
	const row = await tx.query.recommendations.findFirst({
		where: eq(recommendations.id, recId),
		columns: { payload: true },
	})
	const payload = (row?.payload ?? {}) as StaleItemsPayload
	const oldRelated = payload.relatedItems ?? []

	const keptIndices: Array<number> = []
	const newRelated = oldRelated.filter((it, i) => {
		const keep = !deletedIds.has(it.id)
		if (keep) keptIndices.push(i)
		return keep
	})

	if (newRelated.length === oldRelated.length) {
		// Nothing in the payload referenced the deleted items (rec didn't
		// describe them individually). Treat as a fully-applied action.
		await tx.update(recommendations).set({ status: 'applied' }).where(eq(recommendations.id, recId))
		return
	}

	if (newRelated.length === 0) {
		await tx.update(recommendations).set({ status: 'applied' }).where(eq(recommendations.id, recId))
		return
	}

	const oldAffected = payload.affected
	const newAffected = oldAffected
		? {
				...oldAffected,
				count: newRelated.length,
				lines:
					Array.isArray(oldAffected.lines) && oldAffected.lines.length === oldRelated.length
						? keptIndices.map(i => oldAffected.lines![i])
						: oldAffected.lines,
			}
		: undefined

	const newActions = (payload.actions ?? []).filter(a => {
		if (a.apply?.kind !== 'delete-items') return true
		const ids = a.apply.itemIds ?? []
		// Drop the per-item delete row whose target item is now gone.
		if (ids.length === 0) return true
		return !ids.every(id => deletedIds.has(id))
	})

	const newPayload: StaleItemsPayload = {
		...payload,
		relatedItems: newRelated,
		...(newAffected ? { affected: newAffected } : {}),
		actions: newActions,
	}

	await tx.update(recommendations).set({ payload: newPayload }).where(eq(recommendations.id, recId))
}

async function applySetPrimaryList(
	tx: SchemaDatabase,
	userId: string,
	recId: string,
	apply: z.infer<typeof setPrimaryListApplySchema>
): Promise<ApplyRecommendationResult> {
	const listIdNum = Number.parseInt(apply.listId, 10)
	if (!Number.isFinite(listIdNum)) return { ok: false, reason: 'list-not-found' }

	const list = await tx.query.lists.findFirst({
		where: eq(lists.id, listIdNum),
		columns: { id: true, ownerId: true, type: true, isActive: true },
	})
	if (!list) return { ok: false, reason: 'list-not-found' }
	if (list.ownerId !== userId) return { ok: false, reason: 'not-owner' }
	if (list.type === 'giftideas') return { ok: false, reason: 'invalid-list-type' }

	// Clear any existing primary on this user, then promote this list.
	// Mirrors the transaction in setPrimaryListImpl (src/api/_lists-impl.ts).
	await tx
		.update(lists)
		.set({ isPrimary: false })
		.where(and(eq(lists.ownerId, userId), eq(lists.isPrimary, true)))
	await tx.update(lists).set({ isPrimary: true }).where(eq(lists.id, listIdNum))
	await tx.update(recommendations).set({ status: 'applied' }).where(eq(recommendations.id, recId))

	return { ok: true, kind: 'set-primary-list', primaryListId: String(listIdNum) }
}

// Mirrors the validation in updateListImpl (src/api/_lists-impl.ts) for
// the type+name+customHolidayId path. Inline so the whole apply runs
// inside the rec-state transaction. Keep this in sync if updateListImpl
// gains new guardrails.
async function applyConvertList(
	tx: SchemaDatabase,
	userId: string,
	recId: string,
	apply: z.infer<typeof convertListApplySchema>
): Promise<ApplyRecommendationResult> {
	const listIdNum = Number.parseInt(apply.listId, 10)
	if (!Number.isFinite(listIdNum)) return { ok: false, reason: 'list-not-found' }

	const list = await tx.query.lists.findFirst({
		where: eq(lists.id, listIdNum),
		columns: {
			id: true,
			ownerId: true,
			subjectDependentId: true,
			isPrivate: true,
			isActive: true,
			type: true,
			customHolidayId: true,
		},
	})
	if (!list) return { ok: false, reason: 'list-not-found' }
	if (!list.isActive) return { ok: false, reason: 'list-not-found' }
	const editGate = await canEditListAsAnyone(userId, list, tx)
	if (!editGate.ok) return { ok: false, reason: 'cannot-edit' }

	// No-op convert: rec is stale but harmless. Mark applied so the user
	// doesn't see it again.
	if (
		list.type === apply.newType &&
		(apply.newCustomHolidayId === undefined || (apply.newCustomHolidayId ?? null) === list.customHolidayId)
	) {
		await tx.update(recommendations).set({ status: 'applied' }).where(eq(recommendations.id, recId))
		return { ok: true, kind: 'convert-list', listId: String(listIdNum) }
	}

	// Same gates as updateListImpl: todos-lock + tenant type-disable.
	if (list.type === 'todos' || apply.newType === 'todos') {
		return { ok: false, reason: 'todo-list-type-locked' }
	}
	if (apply.newType === 'giftideas' || list.type === 'giftideas') {
		// Convert into/out of giftideas isn't a hygiene action; refuse.
		return { ok: false, reason: 'invalid-list-type' }
	}
	// Lazy `getAppSettings` import: this helper is reachable from the
	// exported `applyRecommendationImpl`, so a static reference would
	// keep the entire `settings-loader -> crypto/app-secret -> node:crypto`
	// chain in the client graph (whose splitter can't elide it). Loading
	// dynamically keeps it server-only without changing semantics.
	const { getAppSettings } = await import('@/lib/settings-loader')
	const settings = await getAppSettings(tx)
	if (isListTypeDisabled(apply.newType, settings)) {
		return { ok: false, reason: 'list-type-disabled' }
	}

	const updates: Record<string, unknown> = { type: apply.newType }
	if (apply.newName !== undefined) updates.name = apply.newName

	// Holiday wiring mirrors updateListImpl. Convert TO holiday requires a
	// customHolidayId; convert AWAY clears it.
	if (apply.newType === 'holiday') {
		const nextCustomHolidayId = apply.newCustomHolidayId !== undefined ? apply.newCustomHolidayId : list.customHolidayId
		if (!nextCustomHolidayId) return { ok: false, reason: 'invalid-holiday-selection' }
		const row = await tx.query.customHolidays.findFirst({ where: eq(customHolidays.id, nextCustomHolidayId) })
		if (!row) return { ok: false, reason: 'invalid-holiday-selection' }
		updates.customHolidayId = row.id
		const customIdChanged = apply.newCustomHolidayId !== undefined && apply.newCustomHolidayId !== list.customHolidayId
		const typeJustBecameHoliday = list.type !== 'holiday'
		if (customIdChanged || typeJustBecameHoliday) updates.lastHolidayArchiveAt = null
	} else if (list.type === 'holiday') {
		// Leaving holiday — clear all holiday metadata.
		updates.customHolidayId = null
		updates.lastHolidayArchiveAt = null
	}

	await tx.update(lists).set(updates).where(eq(lists.id, listIdNum))
	await tx.update(recommendations).set({ status: 'applied' }).where(eq(recommendations.id, recId))
	return { ok: true, kind: 'convert-list', listId: String(listIdNum) }
}

async function applyChangeListPrivacy(
	tx: SchemaDatabase,
	userId: string,
	recId: string,
	apply: z.infer<typeof changeListPrivacyApplySchema>
): Promise<ApplyRecommendationResult> {
	const listIdNum = Number.parseInt(apply.listId, 10)
	if (!Number.isFinite(listIdNum)) return { ok: false, reason: 'list-not-found' }

	const list = await tx.query.lists.findFirst({
		where: eq(lists.id, listIdNum),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true, type: true },
	})
	if (!list) return { ok: false, reason: 'list-not-found' }
	if (!list.isActive) return { ok: false, reason: 'list-not-found' }
	const editGate = await canEditListAsAnyone(userId, list, tx)
	if (!editGate.ok) return { ok: false, reason: 'cannot-edit' }

	// giftideas is force-private; can't flip public via this path.
	if (list.type === 'giftideas') return { ok: false, reason: 'invalid-list-type' }

	if (list.isPrivate === apply.isPrivate) {
		// No-op: mark applied so the user doesn't see it again.
		await tx.update(recommendations).set({ status: 'applied' }).where(eq(recommendations.id, recId))
		return { ok: true, kind: 'change-list-privacy', listId: String(listIdNum) }
	}

	await tx.update(lists).set({ isPrivate: apply.isPrivate }).where(eq(lists.id, listIdNum))
	await tx.update(recommendations).set({ status: 'applied' }).where(eq(recommendations.id, recId))
	return { ok: true, kind: 'change-list-privacy', listId: String(listIdNum) }
}

// Mirrors createListImpl. Same per-type gating, dependent guardian check,
// and holiday wiring. After insert, if setAsPrimary is true AND the
// subject still has no primary at this moment, promote the new list.
async function applyCreateList(
	tx: SchemaDatabase,
	userId: string,
	recId: string,
	apply: z.infer<typeof createListApplySchema>
): Promise<ApplyRecommendationResult> {
	// Caller may have been demoted to child since rec generation. Re-read.
	const me = await tx.query.users.findFirst({ where: eq(users.id, userId), columns: { role: true } })
	const isChild = me?.role === 'child'
	if (apply.type === 'giftideas' && isChild) {
		return { ok: false, reason: 'child-cannot-create-gift-ideas' }
	}

	const { getAppSettings } = await import('@/lib/settings-loader')
	const settings = await getAppSettings(tx)
	if (isListTypeDisabled(apply.type, settings)) {
		return { ok: false, reason: 'list-type-disabled' }
	}

	if (apply.subjectDependentId) {
		const guard = await tx.query.dependentGuardianships.findFirst({
			where: and(eq(dependentGuardianships.guardianUserId, userId), eq(dependentGuardianships.dependentId, apply.subjectDependentId)),
			columns: { guardianUserId: true },
		})
		if (!guard) return { ok: false, reason: 'not-dependent-guardian' }
	}

	let resolvedCustomHolidayId: string | null = null
	if (apply.type === 'holiday') {
		if (!apply.customHolidayId) return { ok: false, reason: 'invalid-holiday-selection' }
		const row = await tx.query.customHolidays.findFirst({ where: eq(customHolidays.id, apply.customHolidayId) })
		if (!row) return { ok: false, reason: 'invalid-holiday-selection' }
		resolvedCustomHolidayId = row.id
	}

	const [inserted] = await tx
		.insert(lists)
		.values({
			name: apply.name,
			type: apply.type,
			isPrivate: apply.type === 'giftideas' ? true : apply.isPrivate,
			ownerId: userId,
			subjectDependentId: apply.subjectDependentId ?? null,
			customHolidayId: resolvedCustomHolidayId,
		})
		.returning({ id: lists.id })

	let didSetPrimary = false
	if (apply.setAsPrimary) {
		// Only promote when no primary currently exists for this owner. We
		// never silently steal the user's manually-chosen primary.
		const existingPrimary = await tx
			.select({ id: lists.id })
			.from(lists)
			.where(and(eq(lists.ownerId, userId), eq(lists.isPrimary, true)))
			.limit(1)
		if (existingPrimary.length === 0) {
			await tx.update(lists).set({ isPrimary: true }).where(eq(lists.id, inserted.id))
			didSetPrimary = true
		}
	}

	await tx.update(recommendations).set({ status: 'applied' }).where(eq(recommendations.id, recId))
	return { ok: true, kind: 'create-list', listId: String(inserted.id), setPrimary: didSetPrimary }
}

// Merges one or more source lists into a survivor list. Restricted to
// spoiler-protected types (wishlist/christmas/birthday) and matching-
// customHolidayId holiday lists so claims always survive the move.
// Items, item groups, and list addons are re-pointed at the survivor;
// `gifted_items` rows point at `item_id` not `list_id` so they ride
// along implicitly. Source lists are force-archived (isActive=false),
// not hard-deleted, because pending-deletion items stay on the source
// list for the orphan-alert flow. See
// docs/architecture/intelligence.md for the spec.
async function applyMergeLists(
	tx: SchemaDatabase,
	userId: string,
	recId: string,
	apply: z.infer<typeof mergeListsApplySchema>
): Promise<ApplyRecommendationResult> {
	const survivorIdNum = Number.parseInt(apply.survivorListId, 10)
	const sourceIdNums = apply.sourceListIds.map(id => Number.parseInt(id, 10))
	if (!Number.isFinite(survivorIdNum) || sourceIdNums.some(n => !Number.isFinite(n))) {
		return { ok: false, reason: 'list-not-found' }
	}
	// Survivor must not appear in the source list — would self-merge.
	if (sourceIdNums.includes(survivorIdNum)) {
		return { ok: false, reason: 'merge-cluster-mismatch' }
	}

	// Pull every list in the cluster at once. SELECT FOR UPDATE locks the
	// rows so a concurrent type-change / archive / delete can't drift the
	// validation; mirrors the pattern used by claimItemGiftImpl.
	const clusterIds = [survivorIdNum, ...sourceIdNums]
	const clusterRows = await tx
		.select({
			id: lists.id,
			ownerId: lists.ownerId,
			subjectDependentId: lists.subjectDependentId,
			isPrivate: lists.isPrivate,
			isActive: lists.isActive,
			type: lists.type,
			customHolidayId: lists.customHolidayId,
		})
		.from(lists)
		.where(inArray(lists.id, clusterIds))
		.for('update')
	if (clusterRows.length !== clusterIds.length) return { ok: false, reason: 'list-not-found' }

	const survivor = clusterRows.find(l => l.id === survivorIdNum)
	if (!survivor) return { ok: false, reason: 'list-not-found' }
	if (!survivor.isActive) return { ok: false, reason: 'list-not-found' }
	const editGate = await canEditListAsAnyone(userId, survivor, tx)
	if (!editGate.ok) return { ok: false, reason: 'cannot-edit' }

	const sources = clusterRows.filter(l => l.id !== survivorIdNum)
	for (const src of sources) {
		// All-or-nothing: any drift on a single source fails the whole apply.
		if (!src.isActive) return { ok: false, reason: 'merge-cluster-mismatch' }
		if (src.type !== survivor.type) return { ok: false, reason: 'merge-cluster-mismatch' }
		if (src.ownerId !== survivor.ownerId) return { ok: false, reason: 'merge-cluster-mismatch' }
		if (src.subjectDependentId !== survivor.subjectDependentId) {
			return { ok: false, reason: 'merge-cluster-mismatch' }
		}
		// Holiday cluster: customHolidayId must match. For non-holiday types,
		// customHolidayId is allowed to be null on either side.
		if (survivor.type === 'holiday' && src.customHolidayId !== survivor.customHolidayId) {
			return { ok: false, reason: 'merge-cluster-mismatch' }
		}
		const srcEditGate = await canEditListAsAnyone(userId, src, tx)
		if (!srcEditGate.ok) return { ok: false, reason: 'cannot-edit' }
		// Defense-in-depth assertion: the rec only ever proposes same-type or
		// matching-customHolidayId merges, so this MUST be false. If it ever
		// returns true the rec generator drifted and we abort rather than
		// silently clear claims.
		if (isCrossTypeMoveDestructive(src.type, survivor.type)) {
			return { ok: false, reason: 'merge-cross-type-destructive' }
		}
	}

	const sourceIdsResolved = sources.map(s => s.id)

	// Step 4: re-point items. Pending-deletion items stay on the source list
	// because the orphan-alert audience needs them queryable there; the
	// source list survives the archive in step 8 with these items intact.
	await tx
		.update(items)
		.set({ listId: survivorIdNum })
		.where(and(inArray(items.listId, sourceIdsResolved), visibleItemsWhere('editable')))

	// Step 5: re-point item groups. `items.groupId` is left as-is so the
	// group identity (type, priority, sortOrder, members) carries through
	// unchanged — a critical guarantee because group priority overrides
	// item priority (logic.md "Items in a group inherit the group's priority").
	await tx.update(itemGroups).set({ listId: survivorIdNum }).where(inArray(itemGroups.listId, sourceIdsResolved))

	// Step 6: re-point list addons. `listAddons.userId` (the gifter) is
	// untouched; addon ownership is a gifter-side concept and doesn't
	// change just because the recipient merged lists.
	await tx.update(listAddons).set({ listId: survivorIdNum }).where(inArray(listAddons.listId, sourceIdsResolved))

	// Step 7: `gifted_items` survives unmoved. The claim row points at
	// `item_id`, not `list_id`, so step 4 carries claims to the survivor
	// implicitly. The split-claim invariant
	// (SUM(giftedItems.quantity) <= items.quantity) is unaffected because
	// per-item quantity didn't change.

	// Step 8: force-archive source lists. Not a hard delete: pending-
	// deletion items still on the source list need the row to stay
	// queryable for the orphan-alert audience.
	await tx.update(lists).set({ isActive: false }).where(inArray(lists.id, sourceIdsResolved))

	// Step 9: survivor's lastHolidayArchiveAt is left as-is. The merge
	// doesn't reset the auto-archive idempotency mark; if the survivor
	// already had its event archived for this occurrence, the merge
	// doesn't make those archived items un-revealed.

	// Step 10: flip rec.
	await tx.update(recommendations).set({ status: 'applied' }).where(eq(recommendations.id, recId))

	return {
		ok: true,
		kind: 'merge-lists',
		survivorListId: String(survivorIdNum),
		archivedSourceListIds: sourceIdsResolved.map(String),
	}
}

// Flips a list to inactive. Reversible — items, addons, and any past
// claims stay queryable; the owner can un-archive later via the edit
// dialog. Used by the stale-public-list rec when the owner picks
// "Archive list" over "Convert to wishlist". The rec generation pass
// keys staleness off `lists.updatedAt` + `MAX(items.updatedAt)` only,
// never `giftedItems` — so there's no claim-existence read on either
// side of the flow.
async function applyArchiveList(
	tx: SchemaDatabase,
	userId: string,
	recId: string,
	apply: z.infer<typeof archiveListApplySchema>
): Promise<ApplyRecommendationResult> {
	const listIdNum = Number.parseInt(apply.listId, 10)
	if (!Number.isFinite(listIdNum)) return { ok: false, reason: 'list-not-found' }

	const list = await tx.query.lists.findFirst({
		where: eq(lists.id, listIdNum),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true, type: true },
	})
	if (!list) return { ok: false, reason: 'list-not-found' }
	if (!list.isActive) {
		// Already archived — mark applied so the user doesn't see the
		// suggestion again. Mirrors the change-list-privacy no-op path.
		await tx.update(recommendations).set({ status: 'applied' }).where(eq(recommendations.id, recId))
		return { ok: true, kind: 'archive-list', listId: String(listIdNum) }
	}
	const editGate = await canEditListAsAnyone(userId, list, tx)
	if (!editGate.ok) return { ok: false, reason: 'cannot-edit' }

	await tx.update(lists).set({ isActive: false }).where(eq(lists.id, listIdNum))
	await tx.update(recommendations).set({ status: 'applied' }).where(eq(recommendations.id, recId))
	return { ok: true, kind: 'archive-list', listId: String(listIdNum) }
}

export const applyRecommendation = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof applyInputSchema>) => applyInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<ApplyRecommendationResult> => {
		const userId = context.session.user.id
		return await db.transaction(async tx => applyRecommendationImpl(tx, userId, data))
	})
