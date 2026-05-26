// Integration coverage for list-owner-reminders' custom-holiday branch.
// The other two branches (birthday, christmas) are covered by inspection
// of the cron handler in birthday-emails.integration.test.ts; this test
// focuses on the recipient-bound audience gate added for
// `customHolidays.recipientUserId / recipientDependentId`.

import { makeDependent, makeDependentGuardianship, makeUser, makeUserRelationship } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it, vi } from 'vitest'

import { customHolidays } from '@/db/schema'

import { listOwnerRemindersImpl } from '../list-owner-reminders'

vi.mock('@/lib/resend', () => ({
	sendPreBirthdayReminderEmail: vi.fn(() => Promise.resolve(null)),
	sendPreChristmasReminderEmail: vi.fn(() => Promise.resolve(null)),
	sendPreCustomHolidayReminderEmail: vi.fn(() => Promise.resolve(null)),
	isEmailConfigured: vi.fn(() => Promise.resolve(true)),
}))

const { sendPreCustomHolidayReminderEmail } = await import('@/lib/resend')

const REMINDER_SETTINGS = {
	enableBirthdayLists: false,
	enableBirthdayReminderEmails: false,
	birthdayReminderLeadDays: 14,
	enableChristmasLists: false,
	enableChristmasReminderEmails: false,
	christmasReminderLeadDays: 14,
	enableGenericHolidayLists: true,
	enableHolidayReminderEmails: true,
	holidayReminderLeadDays: 7,
} as const

// `now` such that today + 7 == June 1 (the holiday date).
const NOW = new Date('2026-05-25T12:00:00Z')

describe('listOwnerRemindersImpl custom-holiday recipient gating', () => {
	it('broadcasts to every non-banned user for a no-recipient row', async () => {
		vi.mocked(sendPreCustomHolidayReminderEmail).mockClear()
		await withRollback(async tx => {
			await makeUser(tx, { name: 'A' })
			await makeUser(tx, { name: 'B' })
			await makeUser(tx, { name: 'C' })
			await tx.insert(customHolidays).values({
				title: 'Founders Day',
				source: 'custom',
				customMonth: 6,
				customDay: 1,
				customYear: null,
			})

			const result = await listOwnerRemindersImpl({ db: tx, now: NOW, settings: REMINDER_SETTINGS })
			expect(result.customHolidayReminders).toBe(3)
		})
	})

	it('narrows the audience to users who can view a user-recipient row', async () => {
		vi.mocked(sendPreCustomHolidayReminderEmail).mockClear()
		await withRollback(async tx => {
			const recipient = await makeUser(tx, { name: 'Recipient' })
			const allowed = await makeUser(tx, { name: 'Allowed' })
			const blocked = await makeUser(tx, { name: 'Blocked' })
			// Default-allow gives `allowed` view access. Explicit deny
			// removes `blocked`.
			await makeUserRelationship(tx, { ownerUserId: recipient.id, viewerUserId: blocked.id, accessLevel: 'none' })

			await tx.insert(customHolidays).values({
				title: "Graham's Day",
				source: 'custom',
				customMonth: 6,
				customDay: 1,
				customYear: null,
				recipientUserId: recipient.id,
			})

			const result = await listOwnerRemindersImpl({ db: tx, now: NOW, settings: REMINDER_SETTINGS })
			// recipient + allowed; not blocked.
			expect(result.customHolidayReminders).toBe(2)
			const recipients = vi
				.mocked(sendPreCustomHolidayReminderEmail)
				.mock.calls.map(([email]) => email)
				.sort()
			expect(recipients).toEqual([allowed.email, recipient.email].sort())
		})
	})

	it('narrows the audience to guardians + default-allow viewers for a dependent-recipient row', async () => {
		vi.mocked(sendPreCustomHolidayReminderEmail).mockClear()
		await withRollback(async tx => {
			const guardian = await makeUser(tx, { name: 'Guardian' })
			const allowed = await makeUser(tx, { name: 'Allowed' })
			const blocked = await makeUser(tx, { name: 'Blocked' })
			const dep = await makeDependent(tx, { createdByUserId: guardian.id })
			await makeDependentGuardianship(tx, { guardianUserId: guardian.id, dependentId: dep.id })
			await makeUserRelationship(tx, { ownerUserId: guardian.id, viewerUserId: blocked.id, accessLevel: 'none' })

			await tx.insert(customHolidays).values({
				title: "Mochi's Birthday",
				source: 'custom',
				customMonth: 6,
				customDay: 1,
				customYear: null,
				recipientDependentId: dep.id,
			})

			const result = await listOwnerRemindersImpl({ db: tx, now: NOW, settings: REMINDER_SETTINGS })
			// guardian + allowed; not blocked.
			expect(result.customHolidayReminders).toBe(2)
			const recipients = vi
				.mocked(sendPreCustomHolidayReminderEmail)
				.mock.calls.map(([email]) => email)
				.sort()
			expect(recipients).toEqual([allowed.email, guardian.email].sort())
		})
	})
})
