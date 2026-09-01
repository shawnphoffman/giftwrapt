import { beforeEach, describe, expect, it, vi } from 'vitest'

// Simulate a server boot with email env vars fully unset. This is the
// scenario that previously crashed the Resend SDK at module-load time.
vi.mock('@/env', () => ({
	env: {
		RESEND_API_KEY: undefined,
		RESEND_FROM_EMAIL: undefined,
		RESEND_FROM_NAME: undefined,
		RESEND_BCC_ADDRESS: undefined,
		// Logging config - required by the pino logger loaded indirectly.
		LOG_LEVEL: 'silent',
		LOG_PRETTY: false,
		// Required by the crypto helper even though we never encrypt here.
		BETTER_AUTH_SECRET: 'test-secret',
	},
}))

// Stub the db singleton so email-config's select() resolves to an empty
// result set (no DB-stored values either).
vi.mock('@/db', () => {
	const emptyQuery = {
		select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
	}
	return { db: emptyQuery }
})

// `vi.resetModules()` runs before each test, so every case below pays a
// full cold import of `@/lib/resend` (React Email templates, pino, the
// crypto helper). That is comfortably under the default 5s timeout on an
// idle machine but not when the unit and storybook projects saturate the
// CPU, which made this file the flakiest in the suite. The timeout is per
// test and only consumed on a hang, so a generous suite-wide value costs
// nothing on the happy path.
describe('resend module with email fully unconfigured', { timeout: 20_000 }, () => {
	beforeEach(() => {
		vi.resetModules()
	})

	it('imports without throwing', async () => {
		await expect(import('@/lib/resend')).resolves.toBeDefined()
	})

	it('reports email as not configured', async () => {
		const { isEmailConfigured } = await import('@/lib/resend')
		expect(await isEmailConfigured()).toBe(false)
	})

	it('no-ops sendNewCommentEmail and returns null', async () => {
		const { sendNewCommentEmail } = await import('@/lib/resend')
		const result = await sendNewCommentEmail('owner', 'owner@example.com', 'commenter', 'hi', 'Item', 1, 1)
		expect(result).toBeNull()
	})

	it('no-ops sendBirthdayEmail and returns null', async () => {
		const { sendBirthdayEmail } = await import('@/lib/resend')
		const result = await sendBirthdayEmail('Alice', 'alice@example.com')
		expect(result).toBeNull()
	})

	it('no-ops sendPostBirthdayEmail and returns null', async () => {
		const { sendPostBirthdayEmail } = await import('@/lib/resend')
		const result = await sendPostBirthdayEmail('alice@example.com', [])
		expect(result).toBeNull()
	})

	it('throws a clear error when sendTestEmail is called with no config', async () => {
		const { sendTestEmail } = await import('@/lib/resend')
		await expect(sendTestEmail()).rejects.toThrow(/not configured/i)
	})

	it('no-ops sendPasswordResetEmail and returns null', async () => {
		const { sendPasswordResetEmail } = await import('@/lib/resend')
		const result = await sendPasswordResetEmail({
			name: 'Alice',
			recipient: 'alice@example.com',
			resetUrl: 'https://example.test/reset-password?token=x',
			expiresInMinutes: 60,
		})
		expect(result).toBeNull()
	})
})
