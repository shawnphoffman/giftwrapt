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
	'invalid-url': 'That is not a valid http(s) URL.',
	'rate-limited': 'Too many requests. Try again shortly.',
	'feature-disabled': 'That feature is turned off on this deployment.',
	'child-cannot-create-gift-ideas': 'Children cannot create gift-ideas lists.',
	'list-type-disabled': 'That list type is turned off on this deployment.',
	'internal-error': 'Something went wrong.',
	'no-primary-list': 'No primary list is set. Pass list_id, or set one with set_primary_list.',
	'list-not-found': 'List not found.',
	'not-owner': 'Only the owner can do that.',
	'invalid-type': 'Invalid list type for this action.',
	'not-dependent-guardian': 'You are not a guardian of that dependent.',
	'invalid-holiday-selection': 'A holiday list needs a valid custom holiday.',
	'todo-list-type-locked': 'A todo list cannot change type, and other lists cannot become todo lists.',
	'todo-list-rejects-items': 'Todo lists do not take gift items.',
	'todo-items-cannot-cross-types': 'Items cannot move between a todo list and a gift list.',
	'mixed-lists': 'All items must be on the same list as the group.',
	'not-allowed': 'That change is not allowed for this item right now.',
	'query-too-short': 'The search query is too short.',
	'all-providers-failed': 'The page could not be read. Add the item by title instead.',
	'no-providers-available': 'No scrape provider is configured on this deployment.',
	timeout: 'Reading the page took too long. Add the item by title instead.',
	'invalid-barcode': 'That barcode is not a valid GTIN.',
	'provider-unavailable': 'The barcode provider is unavailable right now.',
	'barcode-disabled': 'Barcode lookup is turned off on this deployment.',
	'item-not-found': 'Item not found.',
	'not-yours': 'That is not your claim or gift.',
	'cannot-claim-own-list': 'You cannot claim items on your own list.',
	'cannot-add-to-own-list': 'You cannot add an off-list gift to your own list.',
	'group-already-claimed': 'Another item in this pick-one group is already claimed, so this one is locked.',
	'group-out-of-order': 'Items in this group must be claimed in order; an earlier one is still open.',
	unavailable: 'This item is marked unavailable and cannot be claimed.',
	'over-claim': 'Not that many are left to claim.',
	'idea-not-found': 'That gift idea no longer exists.',
	'idea-already-used': 'That gift idea has already been used.',
	'no-cost': 'Set a total cost on the claim before splitting it.',
	'invalid-gifter': 'Every split entry must be a co-gifter on the claim.',
	'exceeds-total': 'The split adds up to more than the total cost.',
	'comments-disabled': 'Comments are turned off on this deployment.',
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
