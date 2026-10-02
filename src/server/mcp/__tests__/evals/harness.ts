// The MCP eval harness: runs a model against the real tool surface over
// the in-memory transport and records how it got to its answer. Used by
// ../evals.integration.test.ts. See that file for how to run it.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { generateText, jsonSchema, type LanguageModel, stepCountIs, tool, type ToolSet } from 'ai'

import { db } from '@/db'
import { createLogger } from '@/lib/logger'
import { getAppSettings } from '@/lib/settings-loader'

import type { McpActor, ToolContext } from '../../context'
import { createMcpServer } from '../../server'

export type ToolCallRecord = { name: string; args: unknown; isError: boolean }

export type EvalRun = {
	answer: string
	calls: Array<ToolCallRecord>
	toolErrors: number
	steps: number
	inputTokens: number
	outputTokens: number
}

const MAX_STEPS = 12

/**
 * Lets `model` act as `userId` with every MCP tool until it answers or
 * runs out of steps. The model sees exactly what a client would: the
 * server's instructions, each tool's description and input schema, and
 * the text block of each result.
 */
export async function runEval(args: { model: LanguageModel; userId: string; prompt: string }): Promise<EvalRun> {
	const actor: McpActor = { userId: args.userId, isAdmin: false, clientId: 'cid-eval', tokenId: 'tok-eval', scopes: [] }
	const ctx: ToolContext = { actor, settings: await getAppSettings(db), dbx: db, log: createLogger('mcp-eval'), now: new Date() }
	const server = createMcpServer(ctx)
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
	await server.connect(serverTransport)
	const client = new Client({ name: 'eval', version: '0' })
	await client.connect(clientTransport)

	const calls: Array<ToolCallRecord> = []
	try {
		const { tools: listed } = await client.listTools()
		const tools: ToolSet = {}
		for (const t of listed) {
			tools[t.name] = tool({
				description: t.description,
				inputSchema: jsonSchema(t.inputSchema as Parameters<typeof jsonSchema>[0]),
				execute: async (input: unknown) => {
					try {
						const result = (await client.callTool({ name: t.name, arguments: input as Record<string, unknown> })) as {
							isError?: boolean
							content: Array<{ type: string; text?: string }>
						}
						calls.push({ name: t.name, args: input, isError: result.isError === true })
						return result.content.map(c => (c.type === 'text' ? c.text : '')).join('\n')
					} catch (err) {
						// A protocol-level failure (bad arguments, a result that
						// fails its schema) counts as a tool error too, and the
						// model gets to see it.
						const message = err instanceof Error ? err.message : String(err)
						calls.push({ name: t.name, args: input, isError: true })
						return `Error: ${message}`
					}
				},
			})
		}

		const result = await generateText({
			model: args.model,
			system: client.getInstructions(),
			prompt: args.prompt,
			tools,
			stopWhen: stepCountIs(MAX_STEPS),
		})

		return {
			answer: result.text,
			calls,
			toolErrors: calls.filter(c => c.isError).length,
			steps: result.steps.length,
			inputTokens: result.totalUsage.inputTokens ?? 0,
			outputTokens: result.totalUsage.outputTokens ?? 0,
		}
	} finally {
		await client.close()
		await server.close()
	}
}

export type EvalRow = { task: string; pass: boolean; calls: number; toolErrors: number; tokens: number; note: string }

export function formatTable(rows: Array<EvalRow>): string {
	const header = ['task', 'pass', 'calls', 'errors', 'tokens', 'note']
	const body = rows.map(r => [r.task, r.pass ? 'yes' : 'NO', String(r.calls), String(r.toolErrors), String(r.tokens), r.note])
	const widths = header.map((h, i) => Math.max(h.length, ...body.map(row => row[i].length)))
	const line = (cells: Array<string>): string => cells.map((c, i) => c.padEnd(widths[i])).join('  ')
	return [line(header), line(widths.map(w => '-'.repeat(w))), ...body.map(line)].join('\n')
}
