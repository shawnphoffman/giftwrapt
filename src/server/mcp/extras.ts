// Resources and prompts. Resources are thin read-only views over the same
// handlers the tools use (looked up through the per-request tool
// registry), for clients that attach resources to a conversation. Prompts
// are conversation starters that steer the model to the right tools.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

import type { ToolContext } from './context'
import { toolErrorInfo } from './errors'

async function readVia(ctx: ToolContext, tool: string, args: Record<string, unknown>): Promise<CallToolResult> {
	const handler = ctx.tools?.get(tool)
	if (!handler) throw new Error(`tool ${tool} is not registered`)
	return handler(args)
}

function jsonResource(uri: string, result: CallToolResult) {
	if (result.isError) {
		const err = toolErrorInfo(result)
		throw new Error(err ? `${err.code}: ${err.message}` : 'resource unavailable')
	}
	return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(result.structuredContent ?? {}, null, 2) }] }
}

export function registerResources(server: McpServer, ctx: ToolContext): void {
	server.registerResource(
		'me',
		'giftwrapt://me',
		{
			title: 'Who I Am',
			description: 'The signed-in user, their household, primary list, and enabled features.',
			mimeType: 'application/json',
		},
		async uri => jsonResource(uri.href, await readVia(ctx, 'get_me', {}))
	)

	server.registerResource(
		'list',
		new ResourceTemplate('giftwrapt://lists/{listId}', { list: undefined }),
		{
			title: 'One of My Lists',
			description: 'A list the user owns or can edit, with items and groups (owner view, never claims).',
			mimeType: 'application/json',
		},
		async (uri, variables) => {
			const listId = Number(variables.listId)
			if (!Number.isInteger(listId) || listId <= 0) throw new Error('invalid list id')
			return jsonResource(uri.href, await readVia(ctx, 'get_list', { list_id: listId }))
		}
	)

	server.registerResource(
		'wishlist',
		new ResourceTemplate('giftwrapt://people/{personId}/wishlist', { list: undefined }),
		{
			title: 'Someone’s Wishlist',
			description: 'Another person’s primary list in the gifter view, with claims and remaining quantities.',
			mimeType: 'application/json',
		},
		async (uri, variables) => jsonResource(uri.href, await readVia(ctx, 'get_wishlist', { person_id: String(variables.personId) }))
	)
}

export function registerPrompts(server: McpServer): void {
	server.registerPrompt(
		'plan_gifts_for',
		{
			title: 'Plan Gifts for Someone',
			description: 'Shop for a person: find them, read their wishlist, respect what is already claimed, and propose what to give.',
			argsSchema: {
				person: z.string().describe('Name or email of the person'),
				budget: z.string().optional().describe('Optional budget, e.g. "under 50"'),
			},
		},
		({ person, budget }) => ({
			messages: [
				{
					role: 'user',
					content: {
						type: 'text',
						text: lines([
							`Help me plan gifts for ${person}${budget ? ` with a budget of ${budget}` : ''}.`,
							'Use list_people to find them, then get_gift_context with their id: it returns every list of theirs I can see, what is already claimed, what I have given them before, and what is coming up. Skip anything already fully claimed, respect pick-one and in-order groups, and note what I have already planned.',
							'Suggest two or three items to claim, then ask before calling claim_item. If I have my own gift ideas for them, mention those separately and label them as my ideas; never present them as things on their list.',
						]),
					},
				},
			],
		})
	)

	server.registerPrompt(
		'tidy_my_list',
		{
			title: 'Tidy My List',
			description: 'Review one of the user’s lists for duplicates, missing prices or links, stale items, and grouping opportunities.',
			argsSchema: { list_id: z.string().optional().describe('List id; defaults to the primary list') },
		},
		({ list_id: listId }) => ({
			messages: [
				{
					role: 'user',
					content: {
						type: 'text',
						text: lines([
							`Tidy up ${listId ? `my list #${listId}` : 'my primary list'}.`,
							'Read it with get_list (and list_recommendations if available). Point out duplicates, items missing a price or link, and items that look like alternatives of each other.',
							'Propose concrete edits (update_item, create_item_group, delete_item) and wait for my go-ahead before changing anything.',
						]),
					},
				},
			],
		})
	)

	server.registerPrompt(
		'whats_coming_up',
		{
			title: 'What’s Coming Up',
			description: 'Upcoming birthdays and holidays with gift status, and what to do next.',
			argsSchema: { days: z.string().optional().describe('Horizon in days (default 60)') },
		},
		({ days }) => ({
			messages: [
				{
					role: 'user',
					content: {
						type: 'text',
						text: lines([
							`What gift occasions are coming up in the next ${days ?? '60'} days?`,
							'Use list_upcoming_occasions, then for each person with nothing planned yet, call get_gift_context with their id and suggest one thing I could claim.',
						]),
					},
				},
			],
		})
	)
}

function lines(items: Array<string>): string {
	return items.join('\n')
}
