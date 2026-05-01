// Integration coverage for the birthday-emails cron impl.
//
// The Resend send functions are vi.mock'd at the module boundary so the
// impl runs end-to-end against the seeded DB but doesn't actually queue
// network requests. We assert that the right recipients were selected
// and that the call payloads carry the expected names / item titles.

import { describe, expect, it, vi } from 'vitest'

import { makeGiftedItem, makeItem, makeList, makeUser } from '../../../../../test/integration/factories'
import { withRollback } from '../../../../../test/integration/setup'
import { birthdayEmailsImpl } from '../_birthday-emails-impl'

vi.mock('@/lib/resend', () => ({
	sendBirthdayEmail: vi.fn((_name: string, _to: string) => Promise.resolve(null)),
	sendPostBirthdayEmail: vi.fn((_to: string, _items: ReadonlyArray<unknown>) => Promise.resolve(null)),
	// isEmailConfigured isn't called by the impl (the route handler
	// short-circuits on it), but mock it for completeness.
	isEmailConfigured: vi.fn(() => Promise.resolve(true)),
}))

const { sendBirthdayEmail, sendPostBirthdayEmail } = await import('@/lib/resend')

describe('birthdayEmailsImpl - day-of', () => {
	it('sends a birthday email to every non-banned user whose birthday is today', async () => {
		vi.mocked(sendBirthdayEmail).mockClear()
		await withRollback(async tx => {
			const a = await makeUser(tx, { name: 'Alice', birthMonth: 'april', birthDay: 30 })
			const b = await makeUser(tx, { name: 'Bob', birthMonth: 'april', birthDay: 30 })
			// Different day - skipped.
			await makeUser(tx, { name: 'Carol', birthMonth: 'april', birthDay: 29 })

			const result = await birthdayEmailsImpl({ db: tx, now: new Date('2026-04-30T12:00:00Z') })
			expect(result.birthdayEmails).toBe(2)

			expect(sendBirthdayEmail).toHaveBeenCalledTimes(2)
			const recipients = vi
				.mocked(sendBirthdayEmail)
				.mock.calls.map(([, email]) => email)
				.sort()
			expect(recipients).toEqual([a.email, b.email].sort())
		})
	})

	it('skips banned users', async () => {
		vi.mocked(sendBirthdayEmail).mockClear()
		await withRollback(async tx => {
			await makeUser(tx, { name: 'Banned', birthMonth: 'april', birthDay: 30, banned: true })
			await makeUser(tx, { name: 'OK', birthMonth: 'april', birthDay: 30 })

			const result = await birthdayEmailsImpl({ db: tx, now: new Date('2026-04-30T12:00:00Z') })
			expect(result.birthdayEmails).toBe(1)
		})
	})

	it('falls back to "there" when the user has no name set', async () => {
		vi.mocked(sendBirthdayEmail).mockClear()
		await withRollback(async tx => {
			await makeUser(tx, { name: null, birthMonth: 'april', birthDay: 30 })
			await birthdayEmailsImpl({ db: tx, now: new Date('2026-04-30T12:00:00Z') })

			expect(sendBirthdayEmail).toHaveBeenCalledTimes(1)
			const [name] = vi.mocked(sendBirthdayEmail).mock.calls[0]
			expect(name).toBe('there')
		})
	})

	it('counts a single failure as not-sent without breaking the batch', async () => {
		vi.mocked(sendBirthdayEmail)
			.mockClear()
			.mockImplementationOnce(() => Promise.reject(new Error('resend down')))
			.mockImplementationOnce(() => Promise.resolve(null))

		await withRollback(async tx => {
			await makeUser(tx, { name: 'A', birthMonth: 'april', birthDay: 30 })
			await makeUser(tx, { name: 'B', birthMonth: 'april', birthDay: 30 })

			const result = await birthdayEmailsImpl({ db: tx, now: new Date('2026-04-30T12:00:00Z') })
			expect(result.birthdayEmails).toBe(1)
			expect(sendBirthdayEmail).toHaveBeenCalledTimes(2)
		})
	})
})

describe('birthdayEmailsImpl - follow-up (14 days after birthday)', () => {
	it('sends a follow-up email summarising archived gifted items', async () => {
		vi.mocked(sendPostBirthdayEmail).mockClear()
		await withRollback(async tx => {
			// Recipient was born 14 days before "today" => qualifies for follow-up.
			const recipient = await makeUser(tx, { name: 'R', birthMonth: 'april', birthDay: 16 })
			const gifter = await makeUser(tx, { name: 'Gifter' })

			const list = await makeList(tx, { ownerId: recipient.id, type: 'birthday' })
			// Only ARCHIVED items show up in the summary.
			const revealed = await makeItem(tx, { listId: list.id, title: 'Telescope', isArchived: true })
			const stillSecret = await makeItem(tx, { listId: list.id, title: 'Diary', isArchived: false })
			await makeGiftedItem(tx, { itemId: revealed.id, gifterId: gifter.id })
			await makeGiftedItem(tx, { itemId: stillSecret.id, gifterId: gifter.id })

			const result = await birthdayEmailsImpl({ db: tx, now: new Date('2026-04-30T12:00:00Z') })
			expect(result.followUpEmails).toBe(1)
			expect(sendPostBirthdayEmail).toHaveBeenCalledTimes(1)

			const [to, items] = vi.mocked(sendPostBirthdayEmail).mock.calls[0]
			expect(to).toBe(recipient.email)
			expect(items).toHaveLength(1)
			expect(items[0]).toMatchObject({ title: 'Telescope' })
			expect(items[0].gifters).toContain('Gifter')
		})
	})

	it('does not send a follow-up when the user has no archived gifted items', async () => {
		vi.mocked(sendPostBirthdayEmail).mockClear()
		await withRollback(async tx => {
			const recipient = await makeUser(tx, { birthMonth: 'april', birthDay: 16 })
			const list = await makeList(tx, { ownerId: recipient.id, type: 'birthday' })
			// Items, but none archived.
			await makeItem(tx, { listId: list.id, isArchived: false })

			const result = await birthdayEmailsImpl({ db: tx, now: new Date('2026-04-30T12:00:00Z') })
			expect(result.followUpEmails).toBe(0)
			expect(sendPostBirthdayEmail).not.toHaveBeenCalled()
		})
	})

	it('credits the partner of the gifter alongside the gifter', async () => {
		// Mirrors the partner-aware credit predicate from purchases.ts §logic.md.
		vi.mocked(sendPostBirthdayEmail).mockClear()
		await withRollback(async tx => {
			const recipient = await makeUser(tx, { birthMonth: 'april', birthDay: 16 })
			const partnerOfGifter = await makeUser(tx, { name: 'Partner' })
			const gifter = await makeUser(tx, { name: 'Gifter', partnerId: partnerOfGifter.id })
			// `namesForGifter` walks the lookup map and pulls in
			// `gifter.partnerId` once it sees it on the gifter row, so the
			// one-directional partnerId set above is sufficient.

			const list = await makeList(tx, { ownerId: recipient.id, type: 'birthday' })
			const item = await makeItem(tx, { listId: list.id, title: 'Hammock', isArchived: true })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			await birthdayEmailsImpl({ db: tx, now: new Date('2026-04-30T12:00:00Z') })
			expect(sendPostBirthdayEmail).toHaveBeenCalledTimes(1)
			const [, items] = vi.mocked(sendPostBirthdayEmail).mock.calls[0]
			// Gifter is named directly. Partner is reachable via the gifter's
			// partnerId; the gifters helper should pull them in.
			expect(items[0].gifters).toContain('Gifter')
			expect(items[0].gifters).toContain('Partner')
		})
	})
})
