// Tool results. Every tool returns a short text summary for the model plus
// `structuredContent` for clients that read it. Domain refusals come back
// as `isError: true` with a stable `code` so the model can explain them;
// the vocabulary mirrors the mobile API's error envelope.

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

const MESSAGES: Partial<Record<string, string>> = {
	'not-found': 'Not found.',
	'not-authorized': 'You do not have permission to do that.',
	'not-visible': 'Not found.',
	'is-owner': 'That is your own list: you can see and edit it, but you cannot shop from it.',
	'invalid-input': 'The submitted data is invalid.',
	'invalid-id': 'The submitted id is invalid.',
	'invalid-url': 'The url is invalid.',
	'rate-limited': 'Too many requests. Try again shortly.',
	'feature-disabled': 'That feature is turned off on this deployment.',
	'child-cannot-create-gift-ideas': 'Children cannot create gift-ideas lists.',
	'list-type-disabled': 'That list type is turned off on this deployment.',
	'internal-error': 'Something went wrong.',
}

export type ToolErrorShape = { error: { code: string; message: string; details?: Record<string, unknown> } }

export function toolError(code: string, message?: string, details?: Record<string, unknown>): CallToolResult {
	const text = message ?? MESSAGES[code] ?? 'Something went wrong.'
	const structured: ToolErrorShape = { error: { code, message: text, ...(details ? { details } : {}) } }
	return {
		isError: true,
		content: [{ type: 'text', text: `Error (${code}): ${text}` }],
		structuredContent: structured,
	}
}

export function toolOk<T extends Record<string, unknown>>(text: string, structured: T): CallToolResult {
	return {
		content: [{ type: 'text', text }],
		structuredContent: structured,
	}
}
