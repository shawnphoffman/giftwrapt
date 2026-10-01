// Builds one `McpServer` per request (stateless Streamable HTTP; see
// app.ts) and registers every tool family against the actor's context.
// `defineTool` is the single registration path: it wraps each handler
// with timing, metrics, and a catch-all so a thrown error becomes a
// tool error instead of a transport failure.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import type { ZodRawShape } from 'zod'
import type { z } from 'zod'

import { BUILD_INFO } from '@/lib/build-info'
import { mcpToolCallsTotal, mcpToolDurationMs } from '@/lib/observability/metrics'

import type { ToolContext } from './context'
import { toolError } from './errors'
import { registerCommentTools } from './tools/comments'
import { registerGroupTools } from './tools/groups'
import { registerItemTools } from './tools/items'
import { registerListMutationTools } from './tools/list-mutations'
import { registerListTools } from './tools/lists'
import { registerMeTools } from './tools/me'
import { registerPeopleTools } from './tools/people'
import { registerShoppingTools } from './tools/shopping'

export const MCP_SERVER_NAME = 'giftwrapt'

const INSTRUCTIONS = [
	'GiftWrapt is a gift-coordination app. You act as the signed-in user with exactly their access.',
	'Two views exist and must never be mixed:',
	'- Owner view (list_my_lists, get_list): the user’s own lists and lists they can edit. Never shows who claimed a gift, so surprises stay surprises. Do not speculate about claims on these lists.',
	'- Gifter view (get_wishlist): other people’s lists, including claims, so the user can shop without duplicating gifts.',
	'Start with get_me to learn who the user is, then list_people to see who they can shop for.',
	'Ids are stable: use the numeric list and item ids the tools return.',
].join('\n')

export type ToolSpec<TIn extends ZodRawShape, TOut extends ZodRawShape> = {
	name: string
	title: string
	description: string
	inputSchema: TIn
	outputSchema: TOut
	annotations: ToolAnnotations & { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean }
	handler: (args: z.infer<z.ZodObject<TIn>>, ctx: ToolContext) => Promise<CallToolResult>
}

export function defineTool<TIn extends ZodRawShape, TOut extends ZodRawShape>(
	server: McpServer,
	ctx: ToolContext,
	spec: ToolSpec<TIn, TOut>
): void {
	server.registerTool(
		spec.name,
		{
			title: spec.title,
			description: spec.description,
			inputSchema: spec.inputSchema,
			outputSchema: spec.outputSchema,
			annotations: { ...spec.annotations, openWorldHint: false },
		},
		(async (args: z.infer<z.ZodObject<TIn>>): Promise<CallToolResult> => {
			const started = Date.now()
			let outcome: 'ok' | 'error' | 'failed' = 'ok'
			try {
				const result = await spec.handler(args, ctx)
				if (result.isError) outcome = 'error'
				return result
			} catch (err) {
				outcome = 'failed'
				ctx.log.error({ err, tool: spec.name, userId: ctx.actor.userId, clientId: ctx.actor.clientId }, 'mcp tool threw')
				return toolError('internal-error')
			} finally {
				const ms = Date.now() - started
				mcpToolCallsTotal.inc({ tool: spec.name, outcome })
				mcpToolDurationMs.observe({ tool: spec.name }, ms)
				ctx.log.info({ tool: spec.name, outcome, ms, clientId: ctx.actor.clientId }, 'mcp tool call')
			}
		}) as never
	)
}

export function createMcpServer(ctx: ToolContext): McpServer {
	const server = new McpServer({ name: MCP_SERVER_NAME, version: BUILD_INFO.version }, { instructions: INSTRUCTIONS })
	registerMeTools(server, ctx)
	registerListTools(server, ctx)
	registerListMutationTools(server, ctx)
	registerItemTools(server, ctx)
	registerGroupTools(server, ctx)
	registerPeopleTools(server, ctx)
	registerShoppingTools(server, ctx)
	registerCommentTools(server, ctx)
	return server
}
