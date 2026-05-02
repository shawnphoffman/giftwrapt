// Server-only dependent implementations. Same isolation pattern as the
// other `_*-impl.ts` files: this module imports `db`, drizzle ops, and
// other server-only utilities; the public `dependents.ts` surface only
// references it from inside server-fn handler bodies, which TanStack
// Start strips on the client.

import { and, eq, exists, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db, type SchemaDatabase } from '@/db'
import { dependentGuardianships, dependents, giftedItems, items, lists, users } from '@/db/schema'
import type { BirthMonth } from '@/db/schema/enums'

// ===============================
// Public types
// ===============================

export type DependentSummary = {
	id: string
	name: string
	image: string | null
	birthMonth: BirthMonth | null
	birthDay: number | null
	birthYear: number | null
	isArchived: boolean
	createdAt: string
	updatedAt: string
	guardianIds: Array<string>
}

export type CreateDependentResult =
	| { kind: 'ok'; dependent: DependentSummary }
	| { kind: 'error'; reason: 'role-not-allowed' | 'guardian-role-not-allowed' | 'guardian-not-found' }

export type UpdateDependentResult = { kind: 'ok'; dependent: DependentSummary } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export type DeleteDependentResult =
	| { kind: 'ok'; action: 'deleted' | 'archived' }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export type AddGuardianResult =
	| { kind: 'ok' }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' | 'guardian-not-found' | 'guardian-role-not-allowed' | 'already-guardian' }

export type RemoveGuardianResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-authorized' | 'last-guardian' }

// ===============================
// Input schemas
// ===============================

const BirthMonthValues = [
	'january',
	'february',
	'march',
	'april',
	'may',
	'june',
	'july',
	'august',
	'september',
	'october',
	'november',
	'december',
] as const

const BirthFields = {
	birthMonth: z.enum(BirthMonthValues).nullable().optional(),
	birthDay: z.number().int().min(1).max(31).nullable().optional(),
	birthYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
}

export const CreateDependentInputSchema = z.object({
	name: z.string().min(1).max(60),
	image: z.string().max(2000).nullable().optional(),
	// Admin-supplied list of guardian user ids. At least one is required so
	// the dependent has at least one user who can manage them.
	guardianIds: z.array(z.string().min(1)).min(1).max(20),
	...BirthFields,
})

export const UpdateDependentInputSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1).max(60).optional(),
	image: z.string().max(2000).nullable().optional(),
	...BirthFields,
})

export const DeleteDependentInputSchema = z.object({
	id: z.string().min(1),
})

export const AddDependentGuardianInputSchema = z.object({
	dependentId: z.string().min(1),
	userId: z.string().min(1),
})

export const RemoveDependentGuardianInputSchema = z.object({
	dependentId: z.string().min(1),
	userId: z.string().min(1),
})

// ===============================
// Helpers
// ===============================

function toIso(value: Date | string | null | undefined): string {
	if (!value) return new Date().toISOString()
	return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

async function loadDependentSummary(id: string, dbx: SchemaDatabase): Promise<DependentSummary | null> {
	const row = await dbx.query.dependents.findFirst({
		where: eq(dependents.id, id),
	})
	if (!row) return null
	const guardianRows = await dbx
		.select({ guardianUserId: dependentGuardianships.guardianUserId })
		.from(dependentGuardianships)
		.where(eq(dependentGuardianships.dependentId, id))
	return {
		id: row.id,
		name: row.name,
		image: row.image,
		birthMonth: row.birthMonth,
		birthDay: row.birthDay,
		birthYear: row.birthYear,
		isArchived: row.isArchived,
		createdAt: toIso(row.createdAt),
		updatedAt: toIso(row.updatedAt),
		guardianIds: guardianRows.map(g => g.guardianUserId),
	}
}

// ===============================
// Reads
// ===============================

// Lists every dependent the current user is a guardian of, plus a flag
// for whether the user created it (used by the settings UI to decide
// whether to show the destructive delete affordance).
export type MyDependentsResult = {
	dependents: Array<DependentSummary & { createdByMe: boolean }>
}

export async function getMyDependentsImpl(args: { userId: string; dbx?: SchemaDatabase }): Promise<MyDependentsResult> {
	const { dbx = db } = args
	const guardedRows = await dbx
		.select({ dependentId: dependentGuardianships.dependentId })
		.from(dependentGuardianships)
		.where(eq(dependentGuardianships.guardianUserId, args.userId))
	const ids = guardedRows.map(g => g.dependentId)
	if (ids.length === 0) return { dependents: [] }

	const rows = await dbx.query.dependents.findMany({
		where: inArray(dependents.id, ids),
	})
	const guardianRows = await dbx
		.select({ dependentId: dependentGuardianships.dependentId, guardianUserId: dependentGuardianships.guardianUserId })
		.from(dependentGuardianships)
		.where(inArray(dependentGuardianships.dependentId, ids))
	const guardianMap = new Map<string, Array<string>>()
	for (const g of guardianRows) {
		const arr = guardianMap.get(g.dependentId) ?? []
		arr.push(g.guardianUserId)
		guardianMap.set(g.dependentId, arr)
	}

	return {
		dependents: rows.map(row => ({
			id: row.id,
			name: row.name,
			image: row.image,
			birthMonth: row.birthMonth,
			birthDay: row.birthDay,
			birthYear: row.birthYear,
			isArchived: row.isArchived,
			createdAt: toIso(row.createdAt),
			updatedAt: toIso(row.updatedAt),
			guardianIds: guardianMap.get(row.id) ?? [],
			createdByMe: row.createdByUserId === args.userId,
		})),
	}
}

// ===============================
// Writes
// ===============================

// Admin-only: create a dependent and assign one or more guardian users.
// The actor (admin) does NOT auto-become a guardian; admins specify
// `guardianIds` explicitly. Children cannot be guardians.
export async function createDependentImpl(args: {
	userId: string
	input: z.infer<typeof CreateDependentInputSchema>
	dbx?: SchemaDatabase
}): Promise<CreateDependentResult> {
	const { dbx = db, userId, input } = args

	const guardianIds = Array.from(new Set(input.guardianIds))
	const guardians = await dbx.query.users.findMany({
		where: inArray(users.id, guardianIds),
		columns: { id: true, role: true },
	})
	if (guardians.length !== guardianIds.length) return { kind: 'error', reason: 'guardian-not-found' }
	if (guardians.some(g => g.role === 'child')) return { kind: 'error', reason: 'guardian-role-not-allowed' }

	const id = crypto.randomUUID()
	const now = new Date()

	await dbx.transaction(async tx => {
		await tx.insert(dependents).values({
			id,
			name: input.name,
			image: input.image ?? null,
			birthMonth: input.birthMonth ?? null,
			birthDay: input.birthDay ?? null,
			birthYear: input.birthYear ?? null,
			createdByUserId: userId,
			updatedAt: now,
			createdAt: now,
		})
		await tx.insert(dependentGuardianships).values(
			guardianIds.map(guardianUserId => ({
				guardianUserId,
				dependentId: id,
				updatedAt: now,
				createdAt: now,
			}))
		)
	})

	const summary = await loadDependentSummary(id, dbx)
	if (!summary) return { kind: 'error', reason: 'guardian-not-found' }
	return { kind: 'ok', dependent: summary }
}

// Admin-only: edit a dependent's name / photo / birthday. Authz is gated
// by the server-fn middleware; this impl trusts the caller and just runs
// the update.
export async function updateDependentImpl(args: {
	input: z.infer<typeof UpdateDependentInputSchema>
	dbx?: SchemaDatabase
}): Promise<UpdateDependentResult> {
	const { dbx = db, input } = args
	const row = await dbx.query.dependents.findFirst({
		where: eq(dependents.id, input.id),
		columns: { id: true },
	})
	if (!row) return { kind: 'error', reason: 'not-found' }

	const patch: Record<string, unknown> = {}
	if (input.name !== undefined) patch.name = input.name
	if (input.image !== undefined) patch.image = input.image
	if (input.birthMonth !== undefined) patch.birthMonth = input.birthMonth
	if (input.birthDay !== undefined) patch.birthDay = input.birthDay
	if (input.birthYear !== undefined) patch.birthYear = input.birthYear

	if (Object.keys(patch).length > 0) {
		await dbx.update(dependents).set(patch).where(eq(dependents.id, input.id))
	}

	const summary = await loadDependentSummary(input.id, dbx)
	if (!summary) return { kind: 'error', reason: 'not-found' }
	return { kind: 'ok', dependent: summary }
}

// Admin-only: delete a dependent. If any of their lists has at least
// one claim we force-archive instead of hard-delete (mirrors the lists
// rule). Otherwise cascade-delete the dependent + their lists + their
// guardianships.
export async function deleteDependentImpl(args: { id: string; dbx?: SchemaDatabase }): Promise<DeleteDependentResult> {
	const { dbx = db, id } = args
	const row = await dbx.query.dependents.findFirst({
		where: eq(dependents.id, id),
		columns: { id: true },
	})
	if (!row) return { kind: 'error', reason: 'not-found' }

	// Detect any claim attached to a list owned-by-subject for this dependent.
	const hasClaims = await dbx
		.select({ id: giftedItems.id })
		.from(giftedItems)
		.innerJoin(items, eq(items.id, giftedItems.itemId))
		.innerJoin(lists, eq(lists.id, items.listId))
		.where(eq(lists.subjectDependentId, id))
		.limit(1)

	if (hasClaims.length > 0) {
		// Archive: hide from active surfaces but keep the rows so received-gift
		// history stays intact.
		await dbx.transaction(async tx => {
			await tx.update(dependents).set({ isArchived: true }).where(eq(dependents.id, id))
			await tx.update(lists).set({ isActive: false }).where(eq(lists.subjectDependentId, id))
		})
		return { kind: 'ok', action: 'archived' }
	}

	// Hard delete: cascade handles dependent_guardianships and lists where
	// subjectDependentId matches (lists FK uses ON DELETE CASCADE).
	await dbx.delete(dependents).where(eq(dependents.id, id))
	return { kind: 'ok', action: 'deleted' }
}

// Admin-only: add a guardian to a dependent.
export async function addGuardianImpl(args: {
	input: z.infer<typeof AddDependentGuardianInputSchema>
	dbx?: SchemaDatabase
}): Promise<AddGuardianResult> {
	const { dbx = db, input } = args
	const row = await dbx.query.dependents.findFirst({
		where: eq(dependents.id, input.dependentId),
		columns: { id: true },
	})
	if (!row) return { kind: 'error', reason: 'not-found' }

	const target = await dbx.query.users.findFirst({
		where: eq(users.id, input.userId),
		columns: { id: true, role: true },
	})
	if (!target) return { kind: 'error', reason: 'guardian-not-found' }
	if (target.role === 'child') return { kind: 'error', reason: 'guardian-role-not-allowed' }

	const existing = await dbx.query.dependentGuardianships.findFirst({
		where: and(eq(dependentGuardianships.guardianUserId, input.userId), eq(dependentGuardianships.dependentId, input.dependentId)),
		columns: { guardianUserId: true },
	})
	if (existing) return { kind: 'error', reason: 'already-guardian' }

	const now = new Date()
	await dbx.insert(dependentGuardianships).values({
		guardianUserId: input.userId,
		dependentId: input.dependentId,
		updatedAt: now,
		createdAt: now,
	})
	return { kind: 'ok' }
}

// Admin-only: remove a guardian from a dependent.
export async function removeGuardianImpl(args: {
	input: z.infer<typeof RemoveDependentGuardianInputSchema>
	dbx?: SchemaDatabase
}): Promise<RemoveGuardianResult> {
	const { dbx = db, input } = args
	const row = await dbx.query.dependents.findFirst({
		where: eq(dependents.id, input.dependentId),
		columns: { id: true },
	})
	if (!row) return { kind: 'error', reason: 'not-found' }

	// Refuse to drop the last guardian: a dependent with no guardians is
	// unmanageable.
	const guardianCount = await dbx
		.select({ count: sql<number>`count(*)::int` })
		.from(dependentGuardianships)
		.where(eq(dependentGuardianships.dependentId, input.dependentId))
	if ((guardianCount[0]?.count ?? 0) <= 1) return { kind: 'error', reason: 'last-guardian' }

	await dbx
		.delete(dependentGuardianships)
		.where(and(eq(dependentGuardianships.guardianUserId, input.userId), eq(dependentGuardianships.dependentId, input.dependentId)))
	return { kind: 'ok' }
}

// ===============================
// Admin reads
// ===============================

// Admin-only: list every dependent in the system, including archived,
// for the management UI. Includes the resolved guardian users so the
// admin form can render avatars and names without a second round trip.
export type AdminDependentRow = DependentSummary & {
	guardians: Array<{ id: string; name: string | null; email: string; image: string | null }>
}

export type AdminDependentsResult = { dependents: Array<AdminDependentRow> }

export async function getAllDependentsImpl(dbx: SchemaDatabase = db): Promise<AdminDependentsResult> {
	const rows = await dbx.query.dependents.findMany({
		orderBy: (d, { desc: dsc, asc: a }) => [dsc(d.isArchived), a(d.name)],
	})
	if (rows.length === 0) return { dependents: [] }
	const ids = rows.map(r => r.id)
	const guardianRows = await dbx
		.select({
			dependentId: dependentGuardianships.dependentId,
			guardianUserId: dependentGuardianships.guardianUserId,
			name: users.name,
			email: users.email,
			image: users.image,
		})
		.from(dependentGuardianships)
		.innerJoin(users, eq(users.id, dependentGuardianships.guardianUserId))
		.where(inArray(dependentGuardianships.dependentId, ids))

	const guardianMap = new Map<string, Array<{ id: string; name: string | null; email: string; image: string | null }>>()
	for (const g of guardianRows) {
		const arr = guardianMap.get(g.dependentId) ?? []
		arr.push({ id: g.guardianUserId, name: g.name, email: g.email, image: g.image })
		guardianMap.set(g.dependentId, arr)
	}

	return {
		dependents: rows.map(row => ({
			id: row.id,
			name: row.name,
			image: row.image,
			birthMonth: row.birthMonth,
			birthDay: row.birthDay,
			birthYear: row.birthYear,
			isArchived: row.isArchived,
			createdAt: toIso(row.createdAt),
			updatedAt: toIso(row.updatedAt),
			guardianIds: (guardianMap.get(row.id) ?? []).map(g => g.id),
			guardians: guardianMap.get(row.id) ?? [],
		})),
	}
}

// ===============================
// Helpers used by other server fns
// ===============================

// Resolve guardianship in bulk for a viewer. Returns the set of dependent
// ids the viewer is a guardian of - used to scope received-gifts and
// purchases to a guardian's dependents.
export async function getGuardedDependentIds(userId: string, dbx: SchemaDatabase = db): Promise<Array<string>> {
	const rows = await dbx
		.select({ dependentId: dependentGuardianships.dependentId })
		.from(dependentGuardianships)
		.where(eq(dependentGuardianships.guardianUserId, userId))
	return rows.map(r => r.dependentId)
}

// Returns true if the current viewer is a guardian of any list whose
// subject is `dependentId`. Used by the recipient-name resolution code
// path to confirm the viewer should see a dependent's name in surfaces
// like purchase summaries.
export async function viewerCanSeeDependent(viewerId: string, dependentId: string, dbx: SchemaDatabase = db): Promise<boolean> {
	const row = await dbx.query.dependentGuardianships.findFirst({
		where: and(eq(dependentGuardianships.guardianUserId, viewerId), eq(dependentGuardianships.dependentId, dependentId)),
		columns: { guardianUserId: true },
	})
	return !!row
}

// Drizzle-relation helpers re-exported for tests.
export { dependentGuardianships, dependents, exists }
