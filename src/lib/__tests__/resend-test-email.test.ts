import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const sendMock = vi.fn()
vi.mock('resend', () => ({
	Resend: vi.fn().mockImplementation(() => ({
		emails: { send: sendMock },
	})),
}))

describe('sendTestEmail error propagation', () => {
	beforeEach(() => {
		vi.resetModules()
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
