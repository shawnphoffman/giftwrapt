import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { createItemCommentImpl, getCommentsForItemImpl } from '@/api/_comments-impl'

import type { ToolContext } from '../context'
import { toolError, toolOk } from '../errors'
import { lines, plural } from '../format'
import { defineTool } from '../server'

const commentSchema = z.object({
	id: z.number(),
	itemId: z.number(),
	comment: z.string().describe('Mentions appear as @[Name](userId)'),
	author: z.object({ id: z.string(), name: z.string().nullable(), email: z.string() }),
	createdAt: z.string(),
})

export function registerCommentTools(server: McpServer, ctx: ToolContext): void {
	defineTool(server, ctx, {
		name: 'list_comments',
		title: 'List Item Comments',
		description:
			'The conversation on an item the user can see (questions about sizes, coordination between gifters). Only available when the deployment has comments turned on.',
		inputSchema: { item_id: z.number().int().positive() },
		outputSchema: { comments: z.array(commentSchema) },
		annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
		handler: async (args, { actor, dbx, settings }) => {
			if (!settings.enableComments) return toolError('feature-disabled', 'Comments are turned off on this deployment.')
			const rows = await getCommentsForItemImpl({ userId: actor.userId, itemId: args.item_id, dbx })
			const comments = rows.map(c => ({
				id: c.id,
				itemId: c.itemId,
				comment: c.comment,
				author: { id: c.user.id, name: c.user.name, email: c.user.email },
				createdAt: c.createdAt.toISOString(),
			}))
			return toolOk(
				comments.length
					? lines([`${plural(comments.length, 'comment')}.`, ...comments.map(c => `${c.author.name ?? c.author.email}: ${c.comment}`)])
					: 'No comments yet.',
				{ comments }
			)
		},
	})

	defineTool(server, ctx, {
		name: 'add_comment',
		title: 'Add Item Comment',
		description:
			'Post a comment on an item the user can see. Mention someone with @[Their Name](userId). The list owner and anyone mentioned may be emailed.',
		inputSchema: { item_id: z.number().int().positive(), comment: z.string().min(1).max(5000) },
		outputSchema: { comment: commentSchema },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
		handler: async (args, { actor, dbx, settings }) => {
			if (!settings.enableComments) return toolError('feature-disabled', 'Comments are turned off on this deployment.')
			const result = await createItemCommentImpl({ userId: actor.userId, input: { itemId: args.item_id, comment: args.comment }, dbx })
			if (result.kind === 'error')
				return toolError(
					result.reason === 'comments-disabled' ? 'feature-disabled' : result.reason === 'not-visible' ? 'not-found' : result.reason
				)
			const c = result.comment
			const comment = {
				id: c.id,
				itemId: c.itemId,
				comment: c.comment,
				author: { id: c.user.id, name: c.user.name, email: c.user.email },
				createdAt: c.createdAt.toISOString(),
			}
			return toolOk(`Posted comment #${comment.id} on item #${args.item_id}.`, { comment })
		},
	})
}
