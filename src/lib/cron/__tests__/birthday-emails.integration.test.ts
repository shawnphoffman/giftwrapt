// Integration coverage for the birthday-emails cron impl (the day-of
// greeting; the gift summary is the reveal email, covered in
// reveal-emails.integration.test.ts).
//
// The Resend send functions are vi.mock'd at the module boundary so the
// impl runs end-to-end against the seeded DB but doesn't actually queue
// network requests. We assert that the right recipients were selected
// and that the call payloads carry the expected names.

import { makeGuardianship, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it, vi } from 'vitest'

import { birthdayEmailsImpl } from '../birthday-emails'

vi.mock('@/lib/resend', () => ({
	sendBirthdayEmail: vi.fn((_name: string, _to: string) => Promise.resolve(null)),
	// isEmailConfigured isn't called by the impl (the route handler
	// short-circuits on it), but mock it for completeness.
	isEmailConfigured: vi.fn(() => Promise.resolve(true)),
}))

const { sendBirthdayEmail } = await import('@/lib/resend')

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

	it('fans the birthday email out to every guardian of a child user', async () => {
		vi.mocked(sendBirthdayEmail).mockClear()
		await withRollback(async tx => {
			const child = await makeUser(tx, { name: 'Kid', birthMonth: 'april', birthDay: 30, role: 'child' })
			const guardianA = await makeUser(tx, { name: 'GuardianA' })
			const guardianB = await makeUser(tx, { name: 'GuardianB' })
			await makeGuardianship(tx, { parentUserId: guardianA.id, childUserId: child.id })
			await makeGuardianship(tx, { parentUserId: guardianB.id, childUserId: child.id })

			const result = await birthdayEmailsImpl({ db: tx, now: new Date('2026-04-30T12:00:00Z') })
			// The counter still only tracks user-targeted sends; guardian
			// fan-out is bonus.
			expect(result.birthdayEmails).toBe(1)

			expect(sendBirthdayEmail).toHaveBeenCalledTimes(3)
			const recipients = vi
				.mocked(sendBirthdayEmail)
				.mock.calls.map(([, email]) => email)
				.sort()
			expect(recipients).toEqual([child.email, guardianA.email, guardianB.email].sort())
			// The email body still personalizes to the child's name, not the
			// guardian's - guardians get a copy of the child's email.
			for (const [name] of vi.mocked(sendBirthdayEmail).mock.calls) {
				expect(name).toBe('Kid')
			}
		})
	})

	it('skips banned guardians when fanning out', async () => {
		vi.mocked(sendBirthdayEmail).mockClear()
		await withRollback(async tx => {
			const child = await makeUser(tx, { name: 'Kid', birthMonth: 'april', birthDay: 30, role: 'child' })
			const activeGuardian = await makeUser(tx, { name: 'Active' })
			const bannedGuardian = await makeUser(tx, { name: 'Banned', banned: true })
			await makeGuardianship(tx, { parentUserId: activeGuardian.id, childUserId: child.id })
			await makeGuardianship(tx, { parentUserId: bannedGuardian.id, childUserId: child.id })

			await birthdayEmailsImpl({ db: tx, now: new Date('2026-04-30T12:00:00Z') })

			expect(sendBirthdayEmail).toHaveBeenCalledTimes(2)
			const recipients = vi
				.mocked(sendBirthdayEmail)
				.mock.calls.map(([, email]) => email)
				.sort()
			expect(recipients).toEqual([child.email, activeGuardian.email].sort())
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

describe('birthdayEmailsImpl - deployment time zone', () => {
	it('uses the date in the deployment zone, not the UTC date', async () => {
		vi.mocked(sendBirthdayEmail).mockClear()
		await withRollback(async tx => {
			await makeUser(tx, { name: 'Alice', birthMonth: 'april', birthDay: 30 })
			// Apr 30, 7 PM in Los Angeles; already May 1 in UTC.
			const now = new Date('2026-05-01T02:00:00Z')

			expect((await birthdayEmailsImpl({ db: tx, now })).birthdayEmails).toBe(0)
			expect((await birthdayEmailsImpl({ db: tx, now, timeZone: 'America/Los_Angeles' })).birthdayEmails).toBe(1)
		})
	})

	it('reaches the birthday early for a zone east of UTC', async () => {
		vi.mocked(sendBirthdayEmail).mockClear()
		await withRollback(async tx => {
			await makeUser(tx, { name: 'Alice', birthMonth: 'april', birthDay: 30 })
			// Apr 30, 5 AM in Tokyo; still Apr 29 in UTC.
			const now = new Date('2026-04-29T20:00:00Z')

			expect((await birthdayEmailsImpl({ db: tx, now })).birthdayEmails).toBe(0)
			expect((await birthdayEmailsImpl({ db: tx, now, timeZone: 'Asia/Tokyo' })).birthdayEmails).toBe(1)
		})
	})
})
