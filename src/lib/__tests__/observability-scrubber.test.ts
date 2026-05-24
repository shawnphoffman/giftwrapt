import type { ErrorEvent, EventHint } from '@sentry/node'
import { describe, expect, it } from 'vitest'

import { scrubEvent } from '@/lib/observability/scrubber'

const hint = {} as EventHint

function makeEvent(partial: Partial<ErrorEvent>): ErrorEvent {
	return { type: undefined, ...partial } as ErrorEvent
}

describe('scrubEvent', () => {
	it('strips query string off request.url', () => {
		const event = makeEvent({
			request: { url: 'https://example.com/api/foo?token=abc&recovery=xyz' },
		})
		const result = scrubEvent(event, hint)
		expect(result?.request?.url).toBe('https://example.com/api/foo')
	})

	it('redacts authorization and cookie headers, leaves the rest', () => {
		const event = makeEvent({
			request: {
				headers: {
					authorization: 'Bearer secret-token',
					Cookie: 'sessionId=abc',
					'user-agent': 'Mozilla/5.0',
					'x-request-id': 'req-123',
				},
			},
		})
		const result = scrubEvent(event, hint)
		const headers = result?.request?.headers as Record<string, unknown>
		expect(headers.authorization).toBe('[redacted]')
		expect(headers.Cookie).toBe('[redacted]')
		expect(headers['user-agent']).toBe('Mozilla/5.0')
		expect(headers['x-request-id']).toBe('req-123')
	})

	it('drops request.cookies wholesale', () => {
		const event = makeEvent({
			request: {
				cookies: { sessionId: 'abc', csrf: 'xyz' },
			} as unknown as ErrorEvent['request'],
		})
		const result = scrubEvent(event, hint)
		expect(result?.request?.cookies).toBeUndefined()
	})

	it('recursively redacts credential keys in extras', () => {
		const event = makeEvent({
			extra: {
				args: { email: 'user@example.com', password: 'hunter2', token: 't0k3n' },
				nested: { deep: { apiKey: 'k-123' } },
			},
		})
		const result = scrubEvent(event, hint)
		const args = (result?.extra as Record<string, Record<string, unknown>>).args
		expect(args.email).toBe('user@example.com') // not a credential key, kept
		expect(args.password).toBe('[redacted]')
		expect(args.token).toBe('[redacted]')
		const nested = (result?.extra as Record<string, Record<string, Record<string, unknown>>>).nested.deep
		expect(nested.apiKey).toBe('[redacted]')
	})

	it('walks arrays inside extras', () => {
		const event = makeEvent({
			extra: {
				items: [
					{ id: 1, token: 'a' },
					{ id: 2, token: 'b' },
				],
			},
		})
		const result = scrubEvent(event, hint)
		const items = (result?.extra as { items: Array<Record<string, unknown>> }).items
		expect(items[0].id).toBe(1)
		expect(items[0].token).toBe('[redacted]')
		expect(items[1].token).toBe('[redacted]')
	})

	it('redacts credentials inside breadcrumb data', () => {
		const event = makeEvent({
			breadcrumbs: [{ message: 'http call', data: { url: '/api/foo', authorization: 'Bearer secret' } }],
		})
		const result = scrubEvent(event, hint)
		expect(result?.breadcrumbs?.[0]?.data?.authorization).toBe('[redacted]')
		expect(result?.breadcrumbs?.[0]?.data?.url).toBe('/api/foo')
	})

	it('leaves domain fields (item title, gifter id, list name) untouched', () => {
		const event = makeEvent({
			extra: {
				item: { id: 'item-1', title: 'Bicycle', notes: 'red one' },
				gifterId: 'user-2',
				list: { name: 'Birthday wishlist' },
			},
		})
		const result = scrubEvent(event, hint)
		const extra = result?.extra as Record<string, unknown>
		const item = extra.item as Record<string, unknown>
		expect(item.title).toBe('Bicycle')
		expect(item.notes).toBe('red one')
		expect(extra.gifterId).toBe('user-2')
		expect((extra.list as Record<string, unknown>).name).toBe('Birthday wishlist')
	})

	it('handles cyclic references without exploding', () => {
		const obj: Record<string, unknown> = { id: 1 }
		obj.self = obj
		const event = makeEvent({ extra: { obj } })
		expect(() => scrubEvent(event, hint)).not.toThrow()
	})
})
