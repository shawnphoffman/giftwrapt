import { createServerFn } from '@tanstack/react-start'
import { and, asc, count, desc, eq, gt, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db, type SchemaDatabase } from '@/db'
import {
	customHolidays,
	dependentGuardianships,
	dependents,
	giftedItems,
	itemGroups,
	items,
	lists,
	recommendationRuns,
	recommendations,
	recommendationSubItemDismissals,
	users,
} from '@/db/schema'
import { listTypeEnumValues } from '@/db/schema/enums'
import { resolveAiConfig } from '@/lib/ai-config'
import { generateForUser } from '@/lib/intelligence/runner'
import { loggingMiddleware } from '@/lib/logger'
import { canEditList } from '@/lib/permissions'
import { intelligenceRefreshLimiter } from '@/lib/rate-limits'
import { isListTypeDisabled } from '@/lib/settings'
// `getAppSettings` is imported lazily inside every call site below so the
// `settings-loader -> crypto/app-secret -> node:crypto` chain stays out
// of the client graph (server-fn surface; the splitter can't elide a
// static import here once any top-level helper references it).
import { authMiddleware } from '@/middleware/auth'
import { rateLimit } from '@/middleware/rate-limit'

// ─── Types returned to the client ───────────────────────────────────────────

export type IntelligenceRecRow = {
	id: string
	analyzerId: string
	kind: string
	severity: 'info' | 'suggest' | 'important'
	status: 'active' | 'dismissed' | 'applied'
	title: string
	body: string
	createdAt: Date
	dismissedAt: Date | null
	dependentId: string | null
	payload: Record<string, never> | null
	// Sub-item ids the user has dismissed via per-sub-item Skip. Read-side
	// filter; the payload's `subItems` field still contains every current
	// sub-item, so the client knows whether the bundle has anything left
	// to render and the dismissals are easy to debug.
	dismissedSubItemIds?: Array<string>
}

export type IntelligenceDependentRecGroup = {
	dependent: { id: string; name: string; image: string | null }
	recs: Array<IntelligenceRecRow>
}

export type IntelligencePagePayload = {
	enabled: boolean
	providerConfigured: boolean
	// Recs the user owns directly (recommendations.dependentId IS NULL).
	recs: Array<IntelligenceRecRow>
	// Recs scoped to each dependent the user guardians, sorted by dependent
	// name. Empty when there are no dependent recs (or no dependents).
	byDependent: Array<IntelligenceDependentRecGroup>
	lastRun: {
		id: string
		startedAt: Date
		finishedAt: Date | null
		status: 'running' | 'success' | 'error' | 'skipped'
		trigger: 'cron' | 'manual'
		error: string | null
		skipReason: string | null
	} | null
	nextEligibleRefreshAt: Date | null
}

// ─── Read: get my recommendations ───────────────────────────────────────────

export const getMyRecommendations = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(async ({ context }) => {
		const userId = context.session.user.id
		const { getAppSettings } = await import('@/lib/settings-loader')
		const settings = await getAppSettings(db)
		const aiConfig = await resolveAiConfig(db)

		const [allRecs, allSubItemDismissals, lastRunRow, guardianedDeps] = await Promise.all([
			db
				.select({
					id: recommendations.id,
					analyzerId: recommendations.analyzerId,
					kind: recommendations.kind,
					severity: recommendations.severity,
					status: recommendations.status,
					title: recommendations.title,
					body: recommendations.body,
					createdAt: recommendations.createdAt,
					dismissedAt: recommendations.dismissedAt,
					dependentId: recommendations.dependentId,
					payload: recommendations.payload,
					fingerprint: recommendations.fingerprint,
				})
				.from(recommendations)
				.where(eq(recommendations.userId, userId))
				.orderBy(desc(recommendations.createdAt)),
			db
				.select({
					fingerprint: recommendationSubItemDismissals.fingerprint,
					subItemId: recommendationSubItemDismissals.subItemId,
				})
				.from(recommendationSubItemDismissals)
				.where(eq(recommendationSubItemDismissals.userId, userId)),
			db
				.select()
				.from(recommendationRuns)
				.where(eq(recommendationRuns.userId, userId))
				.orderBy(desc(recommendationRuns.startedAt))
				.limit(1),
			// Dependents the user guardians, joined with the dependent row
			// itself so we have name + image for the section header. Sorted by
			// name so the UI order is stable across regenerations.
			db
				.select({ id: dependents.id, name: dependents.name, image: dependents.image })
				.from(dependentGuardianships)
				.innerJoin(dependents, eq(dependentGuardianships.dependentId, dependents.id))
				.where(eq(dependentGuardianships.guardianUserId, userId))
				.orderBy(asc(dependents.name)),
		])

		const lastRun: (typeof lastRunRow)[number] | null = lastRunRow.length > 0 ? lastRunRow[0] : null
		const cooldownMs = settings.intelligenceManualRefreshCooldownMinutes * 60_000
		const lastFinished = lastRun?.finishedAt
		const nextEligibleRefreshAt = lastFinished ? new Date(lastFinished.getTime() + cooldownMs) : null

		// Group dismissals by fingerprint so each rec gets its slice without
		// scanning the full list.
		const dismissalsByFingerprint = new Map<string, Array<string>>()
		for (const d of allSubItemDismissals) {
			const arr = dismissalsByFingerprint.get(d.fingerprint) ?? []
			arr.push(d.subItemId)
			dismissalsByFingerprint.set(d.fingerprint, arr)
		}

		const userRecs: Array<IntelligenceRecRow> = []
		const recsByDep = new Map<string, Array<IntelligenceRecRow>>()
		for (const r of allRecs) {
			const dismissedSubItemIds = dismissalsByFingerprint.get(r.fingerprint) ?? []
			// Auto-hide a bundle whose every sub-item has been dismissed: the
			// user clicked Skip on each row. The DB row stays `active` so a
			// regen with new candidates re-surfaces it; for now it just
			// doesn't render. This is the "auto-empty bundle" rule.
			if (r.status === 'active' && dismissedSubItemIds.length > 0) {
				const payload = (r.payload ?? {}) as { subItems?: Array<{ id: string }> }
				const subItems = payload.subItems ?? []
				if (subItems.length > 0 && subItems.every(s => dismissedSubItemIds.includes(s.id))) {
					continue
				}
			}
			const { fingerprint: _fp, ...rest } = r
			const row: IntelligenceRecRow = {
				...rest,
				payload: r.payload as Record<string, never> | null,
				dismissedSubItemIds: dismissedSubItemIds.length > 0 ? dismissedSubItemIds : undefined,
			}
			if (r.dependentId === null) {
				userRecs.push(row)
			} else {
				const arr = recsByDep.get(r.dependentId) ?? []
				arr.push(row)
				recsByDep.set(r.dependentId, arr)
			}
		}

		const byDependent: Array<IntelligenceDependentRecGroup> = []
		for (const dep of guardianedDeps) {
			const recs = recsByDep.get(dep.id)
			if (!recs || recs.length === 0) continue
			byDependent.push({ dependent: { id: dep.id, name: dep.name, image: dep.image }, recs })
		}

		return {
			enabled: settings.intelligenceEnabled,
			providerConfigured: aiConfig.isValid,
			recs: userRecs,
			byDependent,
			lastRun: lastRun
				? {
						id: lastRun.id,
						startedAt: lastRun.startedAt,
						finishedAt: lastRun.finishedAt,
						status: lastRun.status,
						trigger: lastRun.trigger,
						error: lastRun.error,
						skipReason: lastRun.skipReason,
					}
				: null,
			nextEligibleRefreshAt,
		}
	})

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
	.handler(async ({ context }) => {
		const userId = context.session.user.id
		const { getAppSettings } = await import('@/lib/settings-loader')
		const settings = await getAppSettings(db)

		// Per-user cooldown enforced at the server-fn layer so the user gets
		// a clear "try again later" instead of a silent rate-limit error.
		const cooldownMs = settings.intelligenceManualRefreshCooldownMinutes * 60_000
		const earliest = new Date(Date.now() - cooldownMs)
		const recent = await db
			.select({ id: recommendationRuns.id })
			.from(recommendationRuns)
			.where(
				and(eq(recommendationRuns.userId, userId), eq(recommendationRuns.trigger, 'manual'), gt(recommendationRuns.startedAt, earliest))
			)
			.limit(1)
		if (recent.length > 0) {
			return { status: 'skipped' as const, reason: 'cooldown' }
		}

		return await generateForUser(db, userId, { trigger: 'manual', respectUnreadGuard: false })
	})

// ─── Mutate: dismiss / un-dismiss ───────────────────────────────────────────

const recIdSchema = z.object({ id: z.uuid() })

export const dismissRecommendation = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof recIdSchema>) => recIdSchema.parse(data))
	.handler(async ({ context, data }) => {
		const userId = context.session.user.id
		const result = await db
			.update(recommendations)
			.set({ status: 'dismissed', dismissedAt: sql`now()` })
			.where(and(eq(recommendations.id, data.id), eq(recommendations.userId, userId)))
			.returning({ id: recommendations.id })
		return { ok: result.length > 0 }
	})

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
	.handler(async ({ context, data }) => {
		const userId = context.session.user.id
		const result = await db
			.update(recommendations)
			.set({ status: 'active', dismissedAt: null })
			.where(and(eq(recommendations.id, data.id), eq(recommendations.userId, userId)))
			.returning({ id: recommendations.id })
		return { ok: result.length > 0 }
	})

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

const applyInputSchema = z.object({
	id: z.uuid(),
	apply: z.discriminatedUnion('kind', [
		createGroupApplySchema,
		deleteItemsApplySchema,
		setPrimaryListApplySchema,
		convertListApplySchema,
		changeListPrivacyApplySchema,
		createListApplySchema,
	]),
})

export type ApplyRecommendationResult =
	| { ok: true; kind: 'create-group'; groupId: string }
	| { ok: true; kind: 'delete-items'; deletedCount: number }
	| { ok: true; kind: 'set-primary-list'; primaryListId: string }
	| { ok: true; kind: 'convert-list'; listId: string }
	| { ok: true; kind: 'change-list-privacy'; listId: string }
	| { ok: true; kind: 'create-list'; listId: string; setPrimary: boolean }
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

	// Owner short-circuit mirrors `assertCanEditItems` in src/api/_items-impl.ts;
	// canEditList itself doesn't grant the owner because it's only ever called
	// behind an owner-fast-path elsewhere in the codebase.
	if (list.ownerId !== userId) {
		const editGate = await canEditList(userId, list, tx)
		if (!editGate.ok) return { ok: false, reason: 'cannot-edit' }
	}

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

	if (list.ownerId !== userId) {
		const editGate = await canEditList(userId, list, tx)
		if (!editGate.ok) return { ok: false, reason: 'cannot-edit' }
	}

	const itemRows = await tx.select({ id: items.id, listId: items.listId }).from(items).where(inArray(items.id, itemIdNums))
	if (itemRows.length !== itemIdNums.length) return { ok: false, reason: 'items-changed' }
	for (const row of itemRows) {
		if (row.listId !== listIdNum) return { ok: false, reason: 'items-changed' }
	}

	const claims = await tx.select({ itemId: giftedItems.itemId }).from(giftedItems).where(inArray(giftedItems.itemId, itemIdNums)).limit(1)
	if (claims.length > 0) return { ok: false, reason: 'items-have-claims' }

	await tx.delete(items).where(inArray(items.id, itemIdNums))
	await tx.update(recommendations).set({ status: 'applied' }).where(eq(recommendations.id, recId))

	return { ok: true, kind: 'delete-items', deletedCount: itemIdNums.length }
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
			holidayCountry: true,
			holidayKey: true,
			customHolidayId: true,
		},
	})
	if (!list) return { ok: false, reason: 'list-not-found' }
	if (!list.isActive) return { ok: false, reason: 'list-not-found' }
	if (list.ownerId !== userId) {
		const editGate = await canEditList(userId, list, tx)
		if (!editGate.ok) return { ok: false, reason: 'cannot-edit' }
	}

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
		updates.holidayCountry = row.catalogCountry
		updates.holidayKey = row.catalogKey
		const customIdChanged = apply.newCustomHolidayId !== undefined && apply.newCustomHolidayId !== list.customHolidayId
		const typeJustBecameHoliday = list.type !== 'holiday'
		if (customIdChanged || typeJustBecameHoliday) updates.lastHolidayArchiveAt = null
	} else if (list.type === 'holiday') {
		// Leaving holiday — clear all holiday metadata.
		updates.holidayCountry = null
		updates.holidayKey = null
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
	if (list.ownerId !== userId) {
		const editGate = await canEditList(userId, list, tx)
		if (!editGate.ok) return { ok: false, reason: 'cannot-edit' }
	}

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

	let holidayCountry: string | null = null
	let holidayKey: string | null = null
	let resolvedCustomHolidayId: string | null = null
	if (apply.type === 'holiday') {
		if (!apply.customHolidayId) return { ok: false, reason: 'invalid-holiday-selection' }
		const row = await tx.query.customHolidays.findFirst({ where: eq(customHolidays.id, apply.customHolidayId) })
		if (!row) return { ok: false, reason: 'invalid-holiday-selection' }
		resolvedCustomHolidayId = row.id
		holidayCountry = row.catalogCountry
		holidayKey = row.catalogKey
	}

	const [inserted] = await tx
		.insert(lists)
		.values({
			name: apply.name,
			type: apply.type,
			isPrivate: apply.type === 'giftideas' ? true : apply.isPrivate,
			ownerId: userId,
			subjectDependentId: apply.subjectDependentId ?? null,
			holidayCountry,
			holidayKey,
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

export const applyRecommendation = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof applyInputSchema>) => applyInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<ApplyRecommendationResult> => {
		const userId = context.session.user.id
		return await db.transaction(async tx => applyRecommendationImpl(tx, userId, data))
	})
