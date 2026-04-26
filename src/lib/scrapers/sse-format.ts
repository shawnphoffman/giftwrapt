import type { StreamEvent } from './types'

// SSE wire format for scraping progress events. Single source of truth so
// the route handler and tests/clients all agree.
//
// Each event is `data: <json>\n\n`. The leading `: ` form is reserved for
// keepalive comments, which the route writes separately.
export function formatStreamEvent(event: StreamEvent): string {
	return `data: ${JSON.stringify(event)}\n\n`
}

export function encodeStreamEvent(event: StreamEvent, encoder = new TextEncoder()): Uint8Array {
	return encoder.encode(formatStreamEvent(event))
}

// Parse a single SSE `data: ...\n\n` chunk back into a StreamEvent. Used by
// the client hook (and tests) to read the route's output. Returns null for
// keepalive comments and malformed lines.
export function parseStreamLine(line: string): StreamEvent | null {
	const trimmed = line.trim()
	if (trimmed.length === 0) return null
	if (trimmed.startsWith(':')) return null
	if (!trimmed.startsWith('data:')) return null
	const payload = trimmed.slice('data:'.length).trim()
	if (payload.length === 0) return null
	try {
		return JSON.parse(payload) as StreamEvent
	} catch {
		return null
	}
}
