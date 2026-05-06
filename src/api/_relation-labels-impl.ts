// Server-only impl for the user-relation-labels server fns. Lives in a
// separate file so the static import chain (db, schema) only loads on
// the server. References to these impls from `src/api/relation-labels.ts`
// sit inside `.handler()` callbacks that TanStack Start strips on the
// client.
//
// See `src/db/schema/relation-labels.ts` for the table-level header.

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import type { SchemaDatabase } from '@/db'
import { db } from '@/db'
import { dependentGuardianships, dependents, userRelationLabels, users } from '@/db/schema'
import { type RelationLabel, relationLabelEnumValues } from '@/db/schema/enums'

// =====================================================================
// Result types
// =====================================================================

export type RelationLabelTarget =
	| { kind: 'user'; id: string; name: string | null; email: string; image: string | null }
	| { kind: 'dependent'; id: string; name: string; image: string | null }

export type RelationLabelRow = {
	id: number
	label: RelationLabel
	target: RelationLabelTarget
}

export type AddRelationLabelResult =
	| { kind: 'ok'; id: number }
	| { kind: 'error'; reason: 'invalid-target' | 'self-target' | 'duplicate' | 'target-not-found' | 'not-dependent-guardian' }

export type RemoveRelationLabelResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' }

// =====================================================================
// Input schemas
// =====================================================================

export const AddRelationLabelInputSchema = z
	.object({
		label: z.enum(relationLabelEnumValues),
		targetUserId: z.string().optional(),
		targetDependentId: z.string().optional(),
	})
	.refine(d => Boolean(d.targetUserId) !== Boolean(d.targetDependentId), {
		message: 'Exactly one of targetUserId or targetDependentId is required',
	})

export const RemoveRelationLabelInputSchema = z.object({
	id: z.number().int().positive(),
})

// =====================================================================
// Impls
// =====================================================================

export async function getMyRelationLabelsImpl(args: { userId: string; dbx?: SchemaDatabase }): Promise<Array<RelationLabelRow>> {
	const dbx = args.dbx ?? db
	const rows = await dbx.query.userRelationLabels.findMany({
		where: eq(userRelationLabels.userId, args.userId),
		columns: { id: true, label: true, targetUserId: true, targetDependentId: true },
		with: {
			targetUser: { columns: { id: true, name: true, email: true, image: true } },
			targetDependent: { columns: { id: true, name: true, image: true } },
		},
	})

	const out: Array<RelationLabelRow> = []
	for (const r of rows) {
		if (r.targetUser) {
			out.push({
				id: r.id,
				label: r.label,
				target: { kind: 'user', id: r.targetUser.id, name: r.targetUser.name, email: r.targetUser.email, image: r.targetUser.image },
			})
		} else if (r.targetDependent) {
			out.push({
				id: r.id,
				label: r.label,
				target: { kind: 'dependent', id: r.targetDependent.id, name: r.targetDependent.name, image: r.targetDependent.image },
			})
		}
		// Rows with neither target resolved (the join returned null on
		// both) are skipped silently. This shouldn't happen in practice
		// because the FK cascade removes the row when either target is
		// deleted, but the defensive skip keeps the read path total.
	}
	return out
}

export async function addRelationLabelImpl(args: {
	userId: string
	input: z.infer<typeof AddRelationLabelInputSchema>
	dbx?: SchemaDatabase
}): Promise<AddRelationLabelResult> {
	const dbx = args.dbx ?? db
	const { label, targetUserId, targetDependentId } = args.input

	if (!targetUserId === !targetDependentId) {
		return { kind: 'error', reason: 'invalid-target' }
	}

	if (targetUserId === args.userId) {
		return { kind: 'error', reason: 'self-target' }
	}

	if (targetUserId) {
		const target = await dbx.query.users.findFirst({
			where: eq(users.id, targetUserId),
			columns: { id: true },
		})
		if (!target) return { kind: 'error', reason: 'target-not-found' }
	}

	if (targetDependentId) {
		const target = await dbx.query.dependents.findFirst({
			where: eq(dependents.id, targetDependentId),
			columns: { id: true },
		})
		if (!target) return { kind: 'error', reason: 'target-not-found' }
		// Guardrail: the caller can only label dependents they're a
		// guardian of. Non-guardians have no business pinning random
		// dependents as their mother / father.
		const guard = await dbx.query.dependentGuardianships.findFirst({
			where: and(eq(dependentGuardianships.guardianUserId, args.userId), eq(dependentGuardianships.dependentId, targetDependentId)),
			columns: { guardianUserId: true },
		})
		if (!guard) return { kind: 'error', reason: 'not-dependent-guardian' }
	}

	// Idempotency: same (userId, label, target) is a no-op duplicate.
	const existing = await dbx.query.userRelationLabels.findFirst({
		where: and(
			eq(userRelationLabels.userId, args.userId),
			eq(userRelationLabels.label, label),
			targetUserId ? eq(userRelationLabels.targetUserId, targetUserId) : eq(userRelationLabels.targetDependentId, targetDependentId!)
		),
		columns: { id: true },
	})
	if (existing) return { kind: 'error', reason: 'duplicate' }

	const [row] = await dbx
		.insert(userRelationLabels)
		.values({
			userId: args.userId,
			label,
			targetUserId: targetUserId ?? null,
			targetDependentId: targetDependentId ?? null,
		})
		.returning({ id: userRelationLabels.id })

	return { kind: 'ok', id: row.id }
}

export async function removeRelationLabelImpl(args: {
	userId: string
	input: z.infer<typeof RemoveRelationLabelInputSchema>
	dbx?: SchemaDatabase
}): Promise<RemoveRelationLabelResult> {
	const dbx = args.dbx ?? db
	const result = await dbx
		.delete(userRelationLabels)
		.where(and(eq(userRelationLabels.id, args.input.id), eq(userRelationLabels.userId, args.userId)))
		.returning({ id: userRelationLabels.id })
	if (result.length === 0) return { kind: 'error', reason: 'not-found' }
	return { kind: 'ok' }
}
