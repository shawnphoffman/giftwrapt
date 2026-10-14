import type { ErrorEvent, EventHint } from '@sentry/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	env: { SENTRY_DSN: undefined as string | undefined },
	initialized: false,
	init: vi.fn(),
	captureException: vi.fn(),
	flush: vi.fn(async () => true),
	getSentryStatus: vi.fn(),
}))

vi.mock('@/env', () => ({ env: mocks.env }))

vi.mock('@sentry/node', () => ({
	init: (options: unknown) => {
		mocks.init(options)
		mocks.initialized = true
	},
	isInitialized: () => mocks.initialized,
	captureException: mocks.captureException,
	flush: mocks.flush,
}))

vi.mock('@/lib/observability/config', () => ({ getSentryStatus: mocks.getSentryStatus }))

type BeforeSend = (event: ErrorEvent, hint: EventHint) => Promise<ErrorEvent | null>

// Module state (last known admin toggle) is per import, so each test loads
// a fresh copy.
async function load() {
	vi.resetModules()
	return await import('@/lib/observability/sentry-server')
}

function initOptions(): { beforeSend: BeforeSend } {
	return mocks.init.mock.calls[0][0] as { beforeSend: BeforeSend }
}

const event = { type: undefined, message: 'boom' } as ErrorEvent
const hint = {} as EventHint

beforeEach(() => {
	mocks.env.SENTRY_DSN = undefined
	mocks.initialized = false
	mocks.init.mockClear()
	mocks.captureException.mockClear()
	mocks.flush.mockClear()
	mocks.getSentryStatus.mockReset()
})

describe('without SENTRY_DSN (self-hosts that never opt in)', () => {
	it('never initializes, captures, flushes, or reads settings', async () => {
		const { initSentryServer, captureServerException } = await load()
		initSentryServer()
		await captureServerException(new Error('boom'))
		expect(mocks.init).not.toHaveBeenCalled()
		expect(mocks.captureException).not.toHaveBeenCalled()
		expect(mocks.flush).not.toHaveBeenCalled()
		expect(mocks.getSentryStatus).not.toHaveBeenCalled()
	})
})

describe('with SENTRY_DSN', () => {
	beforeEach(() => {
		mocks.env.SENTRY_DSN = 'https://key@sentry.example/1'
	})

	it('initializes lazily on first capture, then captures and flushes', async () => {
		const { captureServerException } = await load()
		const err = new Error('boom')
		await captureServerException(err, { path: '/x' })
		expect(mocks.init).toHaveBeenCalledTimes(1)
		expect(mocks.captureException).toHaveBeenCalledWith(err, { extra: { path: '/x' } })
		expect(mocks.flush).toHaveBeenCalledTimes(1)
	})

	it('does not re-initialize when another bundle copy already did', async () => {
		mocks.initialized = true
		const { initSentryServer, captureServerException } = await load()
		initSentryServer()
		await captureServerException(new Error('boom'))
		expect(mocks.init).not.toHaveBeenCalled()
		expect(mocks.captureException).toHaveBeenCalledTimes(1)
	})

	it('never throws when the SDK does', async () => {
		mocks.captureException.mockImplementationOnce(() => {
			throw new Error('sdk failure')
		})
		const { captureServerException } = await load()
		await expect(captureServerException(new Error('boom'))).resolves.toBeUndefined()
	})

	describe('beforeSend (admin kill-switch)', () => {
		it('drops events while the admin toggle is off', async () => {
			mocks.getSentryStatus.mockResolvedValue({ enabled: false, reason: 'admin-disabled' })
			const { initSentryServer } = await load()
			initSentryServer()
			expect(await initOptions().beforeSend(event, hint)).toBeNull()
		})

		it('sends scrubbed events while the admin toggle is on', async () => {
			mocks.getSentryStatus.mockResolvedValue({ enabled: true, dsn: mocks.env.SENTRY_DSN })
			const { initSentryServer } = await load()
			initSentryServer()
			expect(await initOptions().beforeSend({ ...event }, hint)).toMatchObject({ message: 'boom' })
		})

		it('uses the last known toggle when the settings read fails', async () => {
			mocks.getSentryStatus.mockResolvedValueOnce({ enabled: false, reason: 'admin-disabled' })
			mocks.getSentryStatus.mockRejectedValueOnce(new Error('db down'))
			const { initSentryServer } = await load()
			initSentryServer()
			const { beforeSend } = initOptions()
			expect(await beforeSend(event, hint)).toBeNull()
			expect(await beforeSend(event, hint)).toBeNull()
		})

		it('sends when the settings read fails before any value was known', async () => {
			mocks.getSentryStatus.mockRejectedValue(new Error('db down'))
			const { initSentryServer } = await load()
			initSentryServer()
			expect(await initOptions().beforeSend({ ...event }, hint)).toMatchObject({ message: 'boom' })
		})
	})
})
