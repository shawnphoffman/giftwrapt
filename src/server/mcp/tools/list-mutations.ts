import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { createListImpl, deleteListImpl, setPrimaryListImpl, updateListImpl } from '@/api/_lists-impl'
import { listTypeEnumValues } from '@/db/schema'

import type { ToolContext } from '../context'
import { toolError, toolOk } from '../errors'
import { defineTool } from '../server'

const creatableTypes = listTypeEnumValues.filter(t => t !== 'test')

export function registerListMutationTools(server: McpServer, ctx: ToolContext): void {
	defineTool(server, ctx, {
		name: 'create_list',
		title: 'Create List',
		description:
			'Create a list for the user (or for a dependent they manage). Gift-ideas lists are always private and may target the person the ideas are for. Holiday lists need a custom_holiday_id from this deployment. Ask before creating if the user already has a list of that type.',
		inputSchema: {
			name: z.string().min(1).max(200),
			type: z.enum(creatableTypes as [string, ...Array<string>]).describe('wishlist, birthday, christmas, holiday, giftideas, or todos'),
			is_private: z.boolean().optional().describe('Private lists are only visible to editors (default false)'),
			description: z.string().max(2000).optional(),
			for_dependent_id: z.string().optional().describe('Make the list for a dependent the user is a guardian of'),
			gift_ideas_target_user_id: z.string().optional(),
			gift_ideas_target_dependent_id: z.string().optional(),
			custom_holiday_id: z.string().uuid().optional(),
		},
		outputSchema: { list: z.object({ id: z.number(), name: z.string(), type: z.string() }) },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
		handler: async (args, { actor }) => {
			const result = await createListImpl({
				actor: { id: actor.userId, isChild: false },
				input: {
					name: args.name,
					type: args.type as (typeof listTypeEnumValues)[number],
					isPrivate: args.is_private ?? false,
					description: args.description,
					subjectDependentId: args.for_dependent_id,
					giftIdeasTargetUserId: args.gift_ideas_target_user_id,
					giftIdeasTargetDependentId: args.gift_ideas_target_dependent_id,
					customHolidayId: args.custom_holiday_id,
				},
			})
			if (result.kind === 'error') return toolError(result.reason)
			return toolOk(`Created list #${result.list.id} "${result.list.name}" (${result.list.type}).`, { list: result.list })
		},
	})

	defineTool(server, ctx, {
		name: 'update_list',
		title: 'Update List',
		description:
			'Rename, describe, re-type, archive (is_active false), or change the privacy of a list the user owns or can edit. Changing a list to or from giftideas clears its target; todo lists cannot change type.',
		inputSchema: {
			list_id: z.number().int().positive(),
			name: z.string().min(1).max(200).optional(),
			type: z.enum(creatableTypes as [string, ...Array<string>]).optional(),
			is_private: z.boolean().optional(),
			description: z.string().max(2000).nullable().optional(),
			is_active: z.boolean().optional().describe('false archives the list'),
		},
		outputSchema: { ok: z.literal(true), listId: z.number() },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		handler: async (args, { actor }) => {
			const result = await updateListImpl({
				actor: { id: actor.userId, isChild: false },
				input: {
					listId: args.list_id,
					name: args.name,
					type: args.type as (typeof listTypeEnumValues)[number] | undefined,
					isPrivate: args.is_private,
					description: args.description,
					isActive: args.is_active,
				},
			})
			if (result.kind === 'error') return toolError(result.reason)
			return toolOk(`Updated list #${args.list_id}.`, { ok: true as const, listId: args.list_id })
		},
	})

	defineTool(server, ctx, {
		name: 'delete_list',
		title: 'Delete List',
		description:
			'Delete a list the user owns. If any item on it has already been claimed by a gifter, the list is archived instead of deleted so gift history survives; the result says which happened. Confirm with the user first.',
		inputSchema: { list_id: z.number().int().positive() },
		outputSchema: { action: z.enum(['deleted', 'archived']), listId: z.number() },
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		handler: async (args, { actor, dbx }) => {
			const result = await deleteListImpl({ db: dbx, actor: { id: actor.userId }, input: { listId: args.list_id } })
			if (result.kind === 'error') return toolError(result.reason)
			const text =
				result.action === 'deleted'
					? `Deleted list #${args.list_id}.`
					: `List #${args.list_id} was archived rather than deleted because it has gift history.`
			return toolOk(text, { action: result.action, listId: args.list_id })
		},
	})

	defineTool(server, ctx, {
		name: 'set_primary_list',
		title: 'Set Primary List',
		description:
			'Mark one of the user’s lists as their primary list (the default for add_item and the one others see first). Gift-ideas lists cannot be primary.',
		inputSchema: {
			list_id: z.number().int().positive(),
			is_primary: z.boolean().optional().describe('false clears the flag (default true)'),
		},
		outputSchema: { ok: z.literal(true), listId: z.number(), isPrimary: z.boolean() },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		handler: async (args, { actor }) => {
			const isPrimary = args.is_primary ?? true
			const result = await setPrimaryListImpl({ actor: { id: actor.userId }, input: { listId: args.list_id, isPrimary } })
			if (result.kind === 'error') return toolError(result.reason)
			return toolOk(isPrimary ? `List #${args.list_id} is now the primary list.` : `List #${args.list_id} is no longer primary.`, {
				ok: true as const,
				listId: args.list_id,
				isPrimary,
			})
		},
	})
}
