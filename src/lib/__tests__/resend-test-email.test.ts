import { beforeEach, describe, expect, it, vi } from 'vitest'

// The first test in this file is sensitive to cold-transform latency
// when the full suite runs in parallel: `@/lib/resend` pulls in a fan
// of React Email templates that vitest has to transform on first
// import. The default 5s per-test timeout is sometimes too tight under
// heavy concurrent compile load. Tests themselves are fast (~0.5s each
// once cached), so we raise the timeout for headroom.
vi.setConfig({ testTimeout: 15_000 })

vi.mock('@/env', () => ({
	env: {
		RESEND_API_KEY: 're_bad_key',
		RESEND_FROM_EMAIL: 'from@example.com',
		RESEND_FROM_NAME: undefined,
		RESEND_BCC_ADDRESS: undefined,
		LOG_LEVEL: 'silent',
		LOG_PRETTY: false,
		BETTER_AUTH_SECRET: 'test-secret',
	},
}))

vi.mock('@/db', () => {
	const emptyQuery = {
		select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
	}
	return { db: emptyQuery }
})

// Stub the email template `sendTestEmail` lazy-imports for kind: 'test'.
// Resolving the real React Email template under the heavy parallel test
// pass can exceed the per-test timeout; this test exercises error
// propagation from the Resend client, not template rendering.
vi.mock('@/emails/test-email', () => ({
	default: () => null,
}))

const sendMock = vi.fn()
vi.mock('resend', () => ({
	Resend: vi.fn().mockImplementation(() => ({
		emails: { send: sendMock },
	})),
}))

describe('sendTestEmail error propagation', () => {
	beforeEach(() => {
		// NOTE: we intentionally do NOT call `vi.resetModules()` here. Each
		// test re-imports `@/lib/resend` but vitest will reuse the cached
		// transformed module, so the only per-test state we need to reset is
		// the mocked Resend `send` function. Module-resetting forces vitest
		// to re-transform the full email-template subtree every test, which
		// blew the per-test timeout in the heavy parallel suite.
		sendMock.mockReset()
	})

	it('throws the Resend error message when send returns { error }', async () => {
		sendMock.mockResolvedValue({
			data: null,
			error: { message: 'API key is invalid', name: 'validation_error', statusCode: 401 },
		})
		const { sendTestEmail } = await import('@/lib/resend')
		await expect(sendTestEmail()).rejects.toThrow('API key is invalid')
	})

	it('throws a generic message when the error has no message field', async () => {
		sendMock.mockResolvedValue({ data: null, error: { statusCode: 500 } })
		const { sendTestEmail } = await import('@/lib/resend')
		await expect(sendTestEmail()).rejects.toThrow(/resend rejected/i)
	})

	it('resolves normally when send returns { data }', async () => {
		sendMock.mockResolvedValue({ data: { id: 'email-123' }, error: null })
		const { sendTestEmail } = await import('@/lib/resend')
		await expect(sendTestEmail()).resolves.toMatchObject({ data: { id: 'email-123' } })
	})
})
