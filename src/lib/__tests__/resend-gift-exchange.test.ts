// Loaded up front, with the file's other imports (see resend-locale.test.ts).
import '@/paraglide/messages.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setOfferedLocalesForTesting } from '@/lib/i18n/locales'

// The gift exchange senders write the subject in the reader's language and
// word a guardian's copy about the child (plan 39). The Resend client is
// mocked; nothing is sent.
setOfferedLocalesForTesting(['en', 'fr'])

vi.setConfig({ testTimeout: 60_000 })

vi.mock('@/env', () => ({
	env: {
		RESEND_API_KEY: 're_test_key',
		RESEND_FROM_EMAIL: 'from@example.com',
		RESEND_FROM_NAME: undefined,
		RESEND_BCC_ADDRESS: undefined,
		LOG_LEVEL: 'silent',
		LOG_PRETTY: false,
		BETTER_AUTH_SECRET: 'test-secret',
	},
}))

vi.mock('@/db', () => {
	// No stored settings: the deployment default language is English.
	const fromResult = () => {
		const promise = Promise.resolve([] as Array<unknown>)
		return Object.assign(promise, { where: () => Promise.resolve([] as Array<unknown>) })
	}
	return { db: { select: () => ({ from: () => fromResult() }) } }
})

const sendMock = vi.fn()
vi.mock('resend', () => ({
	Resend: vi.fn().mockImplementation(() => ({
		emails: { send: sendMock },
	})),
}))

type Sent = { to: string; subject: string; react: { props: { locale: string; childName?: string | null } } }
const lastSend = () => sendMock.mock.calls[sendMock.mock.calls.length - 1][0] as Sent

const args = { exchangeName: 'Family Swap', budget: 50, budgetCurrency: 'USD', giftDate: '2026-12-25' }

describe('gift exchange senders', () => {
	beforeEach(() => {
		sendMock.mockReset()
		sendMock.mockResolvedValue({ data: { id: 'x' }, error: null })
	})

	it('"ready" in the reader’s language', async () => {
		const { sendGiftExchangeReadyEmail } = await import('@/lib/resend')
		await sendGiftExchangeReadyEmail('sam@example.com', { ...args, locale: 'fr' })
		expect(lastSend().subject.replace(/\u00a0/g, ' ')).toBe('Votre tirage pour « Family Swap » est prêt')
		expect(lastSend().react.props.locale).toBe('fr')
		await sendGiftExchangeReadyEmail('sam@example.com', { ...args, locale: null })
		expect(lastSend().subject).toBe('Your assignment for Family Swap is ready')
		expect(lastSend().react.props.locale).toBe('en')
	})

	it('"changed", and a guardian’s copy worded about the child', async () => {
		const { sendGiftExchangeChangedEmail } = await import('@/lib/resend')
		await sendGiftExchangeChangedEmail('sam@example.com', { ...args, locale: 'en' })
		expect(lastSend().subject).toBe('Your assignment for Family Swap has changed')
		await sendGiftExchangeChangedEmail('mum@example.com', { ...args, childName: 'Sam', locale: 'en' })
		expect(lastSend().subject).toBe("Sam's assignment for Family Swap has changed")
		expect(lastSend().react.props.childName).toBe('Sam')
		await sendGiftExchangeChangedEmail('mum@example.com', { ...args, childName: 'Sam', locale: 'fr' })
		expect(lastSend().subject.replace(/\u00a0/g, ' ')).toBe('Le tirage de Sam pour « Family Swap » a changé')
	})
})
