// Dependents (pets, babies, anyone without an account). Core makes
// creating and editing them an admin action (`src/api/dependents.ts`),
// so these tools mirror that: a non-admin gets `not-authorized`, exactly
// as the web would refuse them. Reading dependents is part of get_me.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { createDependentImpl, type DependentSummary, updateDependentImpl } from '@/api/_dependents-impl'
import { birthMonthEnumValues } from '@/db/schema'

import type { ToolContext } from '../context'
import { toolError, toolOk } from '../errors'
import { birthdayString } from '../format'
import { defineTool } from '../server'

const dependentSchema = z.object({
	id: z.string(),
	name: z.string(),
	birthday: z.string().nullable(),
	guardianIds: z.array(z.string()),
	isArchived: z.boolean(),
})

const birthFields = {
	birth_month: z.enum(birthMonthEnumValues).nullable().optional(),
	birth_day: z.number().int().min(1).max(31).nullable().optional(),
	birth_year: z.number().int().min(1900).max(2100).nullable().optional(),
}

function toShape(d: DependentSummary): z.infer<typeof dependentSchema> {
	return {
		id: d.id,
		name: d.name,
		birthday: birthdayString(d.birthMonth, d.birthDay, d.birthYear),
		guardianIds: d.guardianIds,
		isArchived: d.isArchived,
	}
}

export function registerDependentTools(server: McpServer, ctx: ToolContext): void {
	defineTool(server, ctx, {
		name: 'create_dependent',
		title: 'Create Dependent',
		description:
			'Add a dependent (a pet, a baby, anyone without their own account) that the user and any extra guardians will manage lists for. Admin only on this deployment, matching the web.',
		inputSchema: {
			name: z.string().min(1).max(60),
			extra_guardian_ids: z
				.array(z.string())
				.max(19)
				.optional()
				.describe('Other users who should also manage this dependent; the user is always a guardian'),
			...birthFields,
		},
		outputSchema: { dependent: dependentSchema },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
		handler: async (args, { actor, dbx }) => {
			if (!actor.isAdmin) return toolError('not-authorized', 'Only an admin can create dependents on this deployment.')
			const result = await createDependentImpl({
				userId: actor.userId,
				input: {
					name: args.name,
					guardianIds: [actor.userId, ...(args.extra_guardian_ids ?? [])],
					birthMonth: args.birth_month,
					birthDay: args.birth_day,
					birthYear: args.birth_year,
				},
				dbx,
			})
			if (result.kind === 'error') return toolError(result.reason === 'guardian-role-not-allowed' ? 'not-allowed' : result.reason)
			const dependent = toShape(result.dependent)
			return toolOk(`Created dependent "${dependent.name}" (${dependent.id}).`, { dependent })
		},
	})

	defineTool(server, ctx, {
		name: 'update_dependent',
		title: 'Update Dependent',
		description: 'Rename a dependent or set their birthday. Admin only on this deployment, matching the web.',
		inputSchema: { dependent_id: z.string().min(1), name: z.string().min(1).max(60).optional(), ...birthFields },
		outputSchema: { dependent: dependentSchema },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		handler: async (args, { actor, dbx }) => {
			if (!actor.isAdmin) return toolError('not-authorized', 'Only an admin can edit dependents on this deployment.')
			const result = await updateDependentImpl({
				input: {
					id: args.dependent_id,
					name: args.name,
					birthMonth: args.birth_month,
					birthDay: args.birth_day,
					birthYear: args.birth_year,
				},
				dbx,
			})
			if (result.kind === 'error') return toolError(result.reason)
			const dependent = toShape(result.dependent)
			return toolOk(`Updated dependent "${dependent.name}".`, { dependent })
		},
	})
}
