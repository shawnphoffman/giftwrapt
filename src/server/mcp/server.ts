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
import { registerPrompts, registerResources } from './extras'
import { registerCommentTools } from './tools/comments'
import { registerDependentTools } from './tools/dependents'
import { registerGroupTools } from './tools/groups'
import { registerIntelligenceTools } from './tools/intelligence'
import { registerItemTools } from './tools/items'
import { registerListMutationTools } from './tools/list-mutations'
import { registerListTools } from './tools/lists'
import { registerMeTools } from './tools/me'
import { registerOccasionTools } from './tools/occasions'
import { registerPeopleTools } from './tools/people'
import { registerShoppingTools } from './tools/shopping'

export const MCP_SERVER_NAME = 'giftwrapt'

const INSTRUCTIONS = [
	'GiftWrapt is a gift-coordination app. You act as the signed-in user with exactly their access.',
	'Two views exist and must never be mixed:',
	'- Owner view (list_my_lists, get_list): the user’s own lists and lists they can edit. Never shows who claimed a gift, so surprises stay surprises. Do not speculate about claims on these lists.',
	'- Gifter view (get_gift_context for a person, get_wishlist for one list): other people’s lists, including claims, so the user can shop without duplicating gifts.',
	'Gift ideas (giftideas lists, and myGiftIdeas in get_wishlist) are the user’s own private notes about someone. The person did not ask for them and cannot see them. Never describe a gift idea as on someone’s list, as something they want or asked for, or mix ideas in with their list items; always present them separately as the user’s ideas.',
	'Start with get_me to learn who the user is, then list_people to see who they can shop for. To decide what to give someone, call get_gift_context with their id: one call covers their lists, the user’s ideas and past gifts for them, and upcoming occasions.',
	'Long results are paged: when a result says it is truncated, call again with the offset it names.',
	'Ids are stable: use the numeric list and item ids the tools return.',
].join('\n')

const READ_ONLY_INSTRUCTIONS =
	'This connection is read-only: the user chose not to let this assistant change anything, so only lookup tools are available. If the user asks for a change, tell them they can switch this assistant to full access in GiftWrapt under Settings, Connected Apps.'

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
	const wrapped = async (args: z.infer<z.ZodObject<TIn>>): Promise<CallToolResult> => {
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
	}
	// A read-only connection never sees a tool that changes something: the
	// model cannot call what is not registered, and a client that forces
	// the call gets the SDK's unknown-tool error.
	if (ctx.actor.canWrite === false && !spec.annotations.readOnlyHint) return
	ctx.tools ??= new Map()
	ctx.tools.set(spec.name, wrapped as (args: Record<string, unknown>) => Promise<CallToolResult>)
	server.registerTool(
		spec.name,
		{
			title: spec.title,
			description: spec.description,
			inputSchema: spec.inputSchema,
			outputSchema: spec.outputSchema,
			// Closed world unless the tool says it reads the open web (scrapes,
			// barcode providers).
			annotations: { openWorldHint: false, ...spec.annotations },
		},
		wrapped as never
	)
}

export function createMcpServer(ctx: ToolContext): McpServer {
	const instructions = ctx.actor.canWrite === false ? `${INSTRUCTIONS}\n${READ_ONLY_INSTRUCTIONS}` : INSTRUCTIONS
	const server = new McpServer({ name: MCP_SERVER_NAME, version: BUILD_INFO.version }, { instructions })
	registerMeTools(server, ctx)
	registerListTools(server, ctx)
	registerListMutationTools(server, ctx)
	registerItemTools(server, ctx)
	registerGroupTools(server, ctx)
	registerPeopleTools(server, ctx)
	registerShoppingTools(server, ctx)
	registerCommentTools(server, ctx)
	registerOccasionTools(server, ctx)
	registerIntelligenceTools(server, ctx)
	registerDependentTools(server, ctx)
	registerResources(server, ctx)
	registerPrompts(server)
	return server
}
