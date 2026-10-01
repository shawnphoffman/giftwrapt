import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { assignItemsToGroupImpl, createItemGroupImpl, deleteItemGroupImpl, updateItemGroupImpl } from '@/api/_groups-impl'
import { groupTypeEnumValues, priorityEnumValues } from '@/db/schema'

import type { ToolContext } from '../context'
import { toolError, toolOk } from '../errors'
import { defineTool } from '../server'

const groupOut = {
	group: z.object({
		id: z.number(),
		listId: z.number(),
		type: z.enum(groupTypeEnumValues),
		name: z.string().nullable(),
		priority: z.enum(priorityEnumValues),
		itemIds: z.array(z.number()),
	}),
}

const GROUP_RULES =
	'An "or" group means pick one of these (once any is claimed the rest lock); an "order" group means buy them in sequence. Items in a group share the group’s priority.'

export function registerGroupTools(server: McpServer, ctx: ToolContext): void {
	defineTool(server, ctx, {
		name: 'create_item_group',
		title: 'Create Item Group',
		description: `Group items on one of the user’s lists. ${GROUP_RULES} Optionally add items right away.`,
		inputSchema: {
			list_id: z.number().int().positive(),
			type: z.enum(groupTypeEnumValues),
			name: z.string().trim().max(100).optional(),
			priority: z.enum(priorityEnumValues).optional(),
			item_ids: z.array(z.number().int().positive()).max(100).optional().describe('Items on the same list to put in the group, in order'),
		},
		outputSchema: groupOut,
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
		handler: async (args, { actor }) => {
			const created = await createItemGroupImpl({ userId: actor.userId, input: { listId: args.list_id, type: args.type } })
			if (created.kind === 'error') return toolError(created.reason)
			const group = created.group
			if (args.name !== undefined || args.priority !== undefined) {
				const updated = await updateItemGroupImpl({
					userId: actor.userId,
					input: { groupId: group.id, name: args.name ?? null, priority: args.priority },
				})
				if (updated.kind === 'error') return toolError(updated.reason)
			}
			let itemIds: Array<number> = []
			if (args.item_ids && args.item_ids.length > 0) {
				const assigned = await assignItemsToGroupImpl({ userId: actor.userId, input: { groupId: group.id, itemIds: args.item_ids } })
				if (assigned.kind === 'error') return toolError(assigned.reason)
				itemIds = args.item_ids
			}
			return toolOk(
				`Created ${args.type} group #${group.id}${args.name ? ` "${args.name}"` : ''} on list #${args.list_id}${itemIds.length ? ` with ${itemIds.length} items` : ''}.`,
				{
					group: {
						id: group.id,
						listId: group.listId,
						type: args.type,
						name: args.name ?? null,
						priority: args.priority ?? group.priority,
						itemIds,
					},
				}
			)
		},
	})

	defineTool(server, ctx, {
		name: 'update_item_group',
		title: 'Update Item Group',
		description: `Change a group’s type, name, or priority. ${GROUP_RULES}`,
		inputSchema: {
			group_id: z.number().int().positive(),
			type: z.enum(groupTypeEnumValues).optional(),
			name: z.string().trim().max(100).nullable().optional(),
			priority: z.enum(priorityEnumValues).optional(),
		},
		outputSchema: { ok: z.literal(true), groupId: z.number() },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		handler: async (args, { actor }) => {
			if (args.type === undefined && args.name === undefined && args.priority === undefined)
				return toolError('invalid-input', 'Give at least one of type, name, or priority.')
			const result = await updateItemGroupImpl({
				userId: actor.userId,
				input: { groupId: args.group_id, type: args.type, name: args.name, priority: args.priority },
			})
			if (result.kind === 'error') return toolError(result.reason)
			return toolOk(`Updated group #${args.group_id}.`, { ok: true as const, groupId: args.group_id })
		},
	})

	defineTool(server, ctx, {
		name: 'delete_item_group',
		title: 'Delete Item Group',
		description: 'Remove a group. Its items stay on the list, ungrouped.',
		inputSchema: { group_id: z.number().int().positive() },
		outputSchema: { ok: z.literal(true), groupId: z.number() },
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		handler: async (args, { actor }) => {
			const result = await deleteItemGroupImpl({ userId: actor.userId, input: { groupId: args.group_id } })
			if (result.kind === 'error') return toolError(result.reason)
			return toolOk(`Deleted group #${args.group_id}; its items are ungrouped.`, { ok: true as const, groupId: args.group_id })
		},
	})

	defineTool(server, ctx, {
		name: 'assign_items_to_group',
		title: 'Assign Items to Group',
		description: 'Put items into a group (all must be on the group’s list), or pass group_id null to take them out of any group.',
		inputSchema: {
			group_id: z.number().int().positive().nullable(),
			item_ids: z.array(z.number().int().positive()).min(1).max(100),
		},
		outputSchema: { ok: z.literal(true), groupId: z.number().nullable(), itemIds: z.array(z.number()) },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		handler: async (args, { actor }) => {
			const result = await assignItemsToGroupImpl({ userId: actor.userId, input: { groupId: args.group_id, itemIds: args.item_ids } })
			if (result.kind === 'error') return toolError(result.reason)
			const text =
				args.group_id === null
					? `Ungrouped ${args.item_ids.length} items.`
					: `Added ${args.item_ids.length} items to group #${args.group_id}.`
			return toolOk(text, { ok: true as const, groupId: args.group_id, itemIds: args.item_ids })
		},
	})
}
