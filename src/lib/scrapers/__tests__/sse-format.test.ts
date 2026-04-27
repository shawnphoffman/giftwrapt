import { describe, expect, it } from 'vitest'

import { encodeStreamEvent, formatStreamEvent, parseStreamLine } from '../sse-format'
import type { StreamEvent } from '../types'

describe('formatStreamEvent', () => {
	it('serialises an event as `data: <json>\\n\\n`', () => {
		const event: StreamEvent = { type: 'attempt_started', providerId: 'fetch-provider' }
		expect(formatStreamEvent(event)).toBe('data: {"type":"attempt_started","providerId":"fetch-provider"}\n\n')
	})

	it('round-trips through encode + parse', () => {
		const event: StreamEvent = {
			type: 'attempt_completed',
			providerId: 'fetch-provider',
			score: 5,
			ms: 423,
		}
		const encoded = encodeStreamEvent(event)
		const text = new TextDecoder().decode(encoded)
		expect(parseStreamLine(text)).toEqual(event)
	})
})

describe('parseStreamLine', () => {
	it('returns null for keepalive comments', () => {
		expect(parseStreamLine(': connected\n\n')).toBeNull()
		expect(parseStreamLine(': ping')).toBeNull()
	})

	it('returns null for empty lines', () => {
		expect(parseStreamLine('')).toBeNull()
		expect(parseStreamLine('\n\n')).toBeNull()
	})

	it('returns null for malformed JSON', () => {
		expect(parseStreamLine('data: {oops not json}')).toBeNull()
	})

	it('parses each event variant we emit', () => {
		const events: Array<StreamEvent> = [
			{ type: 'plan', sequential: ['fetch-provider'], parallel: [], providerNames: {}, totalTimeoutMs: 20_000, cached: false },
			{ type: 'attempt_started', providerId: 'fetch-provider' },
			{ type: 'attempt_completed', providerId: 'fetch-provider', score: 5, ms: 423 },
			{ type: 'attempt_failed', providerId: 'fetch-provider', errorCode: 'timeout', ms: 10_000 },
			{ type: 'result_ready', result: { imageUrls: ['https://x'] }, fromProvider: 'fetch-provider', cached: false },
			{ type: 'result_updated', result: { imageUrls: [] }, fromProvider: 'ai-provider' },
			{ type: 'done', attempts: [] },
			{ type: 'error', reason: 'all-providers-failed' },
		]
		for (const event of events) {
			const line = formatStreamEvent(event)
			expect(parseStreamLine(line)).toEqual(event)
		}
	})
})
