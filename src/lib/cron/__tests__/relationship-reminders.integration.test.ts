// Integration coverage for relationship-reminders' Valentine's branch.
// The date comes from the reminders country's catalog entry
// (`valentinesSlug`), so Brazil fires ahead of Dia dos Namorados
// (June 12) rather than Feb 14.

import { makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it, vi } from 'vitest'

import { relationshipRemindersImpl } from '../relationship-reminders'

vi.mock('@/lib/resend', () => ({
	sendParentsDayReminderEmail: vi.fn(() => Promise.resolve(null)),
	sendPartnerAnniversaryReminderEmail: vi.fn(() => Promise.resolve(null)),
	sendValentinesDayReminderEmail: vi.fn(() => Promise.resolve(null)),
}))

const { sendValentinesDayReminderEmail } = await import('@/lib/resend')

function settingsFor(country: string) {
	return {
		relationshipRemindersCountry: country,
		enableMothersDayReminders: false,
		mothersDayReminderLeadDays: 7,
		enableMothersDayReminderEmails: false,
		enableFathersDayReminders: false,
		fathersDayReminderLeadDays: 7,
		enableFathersDayReminderEmails: false,
		enableValentinesDayReminders: true,
		valentinesDayReminderLeadDays: 7,
		enableValentinesDayReminderEmails: true,
		enableAnniversaryReminders: false,
		anniversaryReminderLeadDays: 7,
		enableAnniversaryReminderEmails: false,
	}
}

// today + 7 == Feb 14 / June 12.
const FEB_7 = new Date('2027-02-07T12:00:00Z')
const JUNE_5 = new Date('2027-06-05T12:00:00Z')

async function makeCouple(tx: Parameters<Parameters<typeof withRollback>[0]>[0]) {
	const a = await makeUser(tx, { name: 'A' })
	const b = await makeUser(tx, { name: 'B', partnerId: a.id })
	return { a, b }
}

describe('relationshipRemindersImpl Valentine’s date', () => {
	it('fires a week before Feb 14 in the US', async () => {
		vi.mocked(sendValentinesDayReminderEmail).mockClear()
		await withRollback(async tx => {
			const { b } = await makeCouple(tx)
			const result = await relationshipRemindersImpl({ db: tx, now: FEB_7, settings: settingsFor('US') })
			expect(result.valentinesDayReminders).toBe(1)
			expect(vi.mocked(sendValentinesDayReminderEmail).mock.calls.map(([email]) => email)).toEqual([b.email])
		})
	})

	it('fires a week before June 12 in Brazil, not before Feb 14', async () => {
		vi.mocked(sendValentinesDayReminderEmail).mockClear()
		await withRollback(async tx => {
			await makeCouple(tx)
			const feb = await relationshipRemindersImpl({ db: tx, now: FEB_7, settings: settingsFor('BR') })
			expect(feb.valentinesDayReminders).toBe(0)
			const june = await relationshipRemindersImpl({ db: tx, now: JUNE_5, settings: settingsFor('BR') })
			expect(june.valentinesDayReminders).toBe(1)
		})
	})

	it('falls back to Feb 14 for a country with no catalog entry', async () => {
		vi.mocked(sendValentinesDayReminderEmail).mockClear()
		await withRollback(async tx => {
			await makeCouple(tx)
			const result = await relationshipRemindersImpl({ db: tx, now: FEB_7, settings: settingsFor('ZZ') })
			expect(result.valentinesDayReminders).toBe(1)
		})
	})
})
