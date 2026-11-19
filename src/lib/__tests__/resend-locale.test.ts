// Loaded up front, with the file's other imports. The catalog is thousands
// of small modules; importing it for the first time inside a test or a hook
// is slow enough under full-suite load to hit their timeouts.
import '@/paraglide/messages.js'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setOfferedLocalesForTesting } from '@/lib/i18n/locales'

// The send functions write each email in its recipient's language (plan
// 36g). A deployment only offers the languages its operator lists, so list
// both here.
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

const lastSend = () => sendMock.mock.calls[sendMock.mock.calls.length - 1][0] as { subject: string; react: { props: { locale: string } } }

describe('emails are written in the recipient’s language', () => {
	beforeEach(() => {
		sendMock.mockReset()
		sendMock.mockResolvedValue({ data: { id: 'x' }, error: null })
	})

	it('a recipient who chose French gets a French subject and body', async () => {
		const { sendPreChristmasReminderEmail } = await import('@/lib/resend')
		await sendPreChristmasReminderEmail('sam@example.com', { name: 'Sam', leadDays: 30, locale: 'fr' })
		expect(lastSend().subject).toBe('Noël est dans 30 jours')
		expect(lastSend().react.props.locale).toBe('fr')
	})

	it('a recipient with no choice gets the deployment default', async () => {
		const { sendPreChristmasReminderEmail } = await import('@/lib/resend')
		await sendPreChristmasReminderEmail('sam@example.com', { name: 'Sam', leadDays: 30, locale: null })
		expect(lastSend().subject).toBe('Christmas is in 30 days')
		expect(lastSend().react.props.locale).toBe('en')
	})

	it("names Mother's Day in the reader's language", async () => {
		const { sendParentsDayReminderEmail } = await import('@/lib/resend')
		const args = { holidayName: 'Mothering Sunday', relation: 'mother' as const, leadDays: 7, people: [{ name: 'Mum' }] }
		await sendParentsDayReminderEmail('sam@example.com', { ...args, locale: 'fr' })
		expect(lastSend().subject.replace(/\u00a0/g, ' ')).toBe('Fête des Mères : plus que 7 jours')
		// English keeps the holiday catalog's own name for the country.
		await sendParentsDayReminderEmail('sam@example.com', { ...args, locale: 'en' })
		expect(lastSend().subject).toBe('Mothering Sunday is in 7 days')
	})

	it('writes the cleanup reminder’s event in the reader’s language', async () => {
		const { sendOrphanClaimCleanupReminderEmail } = await import('@/lib/resend')
		await sendOrphanClaimCleanupReminderEmail('sam@example.com', {
			username: 'Sam',
			itemTitle: 'Scarf',
			recipientName: 'Kate',
			event: 'christmas',
			listId: 1,
			listName: 'Wishes',
			locale: 'fr',
		})
		const sent = sendMock.mock.calls[0][0] as { react: { props: { eventLabel: string } } }
		expect(sent.react.props.eventLabel).toBe('Noël')
	})
})
