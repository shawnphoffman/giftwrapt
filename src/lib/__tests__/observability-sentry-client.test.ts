import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ init: vi.fn() }))

vi.mock('@sentry/react', () => ({ init: mocks.init, captureException: vi.fn() }))

afterEach(() => {
	vi.unstubAllGlobals()
	mocks.init.mockClear()
})

describe('initSentryClient', () => {
	it('ignores browser-extension messaging errors', async () => {
		vi.stubGlobal('window', {})
		vi.resetModules()
		const { initSentryClient } = await import('@/lib/observability/sentry-client')
		initSentryClient({ dsn: 'https://key@example.invalid/1' })

		const { ignoreErrors } = mocks.init.mock.calls[0][0] as { ignoreErrors: Array<string | RegExp> }
		const matches = (message: string) => ignoreErrors.some(p => (typeof p === 'string' ? message.includes(p) : p.test(message)))
		expect(matches('Invalid call to runtime.sendMessage(). Tab not found.')).toBe(true)
		expect(matches('Failed to fetch')).toBe(false)
	})
})
