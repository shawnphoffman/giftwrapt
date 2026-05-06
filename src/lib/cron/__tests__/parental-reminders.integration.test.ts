// Cron-impl coverage for the parental-relations daily reminder pass.
// The actual email-send call (resend) is replaced via vi.mock so the
// tests don't need a Resend instance; we assert the impl picks the
// right (label, date) trigger and the right recipient set.

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { addRelationLabelImpl } from '@/api/_relation-labels-impl'

import { makeDependent, makeDependentGuardianship, makeUser } from '../../../../test/integration/factories'
import { withRollback } from '../../../../test/integration/setup'
import { parentalRemindersImpl } from '../parental-reminders'

vi.mock('@/lib/resend', () => ({
	sendParentalRelationsReminderEmail: vi.fn(async () => ({ data: { id: 'stubbed' }, error: null })),
}))

const { sendParentalRelationsReminderEmail } = await import('@/lib/resend')
const sendStub = sendParentalRelationsReminderEmail as unknown as ReturnType<typeof vi.fn>

describe('parentalRemindersImpl', () => {
	beforeEach(() => sendStub.mockClear())

	// US Mother's Day 2026 = May 10. With leadDays=7 the trigger day is May 3.
	it('does not send anything when neither holiday is on the trigger day', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const mom = await makeUser(tx)
			await addRelationLabelImpl({ userId: user.id, input: { label: 'mother', targetUserId: mom.id }, dbx: tx })

			const result = await parentalRemindersImpl({ db: tx, now: new Date('2026-04-15T12:00:00Z'), leadDays: 7 })
			expect(result.parentalReminderEmails).toBe(0)
			expect(sendStub).not.toHaveBeenCalled()
		})
	})

	it("emits one reminder per user on the Mother's Day trigger day", async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx, { name: 'Alice' })
			const mom1 = await makeUser(tx, { name: 'Mom Sr' })
			const mom2 = await makeUser(tx, { name: 'Step-Mom' })
			await addRelationLabelImpl({ userId: user.id, input: { label: 'mother', targetUserId: mom1.id }, dbx: tx })
			await addRelationLabelImpl({ userId: user.id, input: { label: 'mother', targetUserId: mom2.id }, dbx: tx })

			// May 3 is exactly 7 days before May 10, 2026.
			const result = await parentalRemindersImpl({ db: tx, now: new Date('2026-05-03T12:00:00Z'), leadDays: 7 })
			expect(result.parentalReminderEmails).toBe(1)
			expect(sendStub).toHaveBeenCalledTimes(1)
			const args = sendStub.mock.calls[0]
			expect(args[0]).toBe(user.email)
			expect(args[1]).toMatchObject({ holidayName: "Mother's Day", leadDays: 7 })
			expect(args[1].people.map((p: { name: string }) => p.name).sort()).toEqual(['Mom Sr', 'Step-Mom'])
		})
	})

	it('skips users with no declared mothers when MD is the trigger', async () => {
		await withRollback(async tx => {
			const userWithMom = await makeUser(tx)
			const userWithoutMom = await makeUser(tx)
			const userWithFather = await makeUser(tx)
			const someone = await makeUser(tx, { name: 'Mom Smith' })
			const dad = await makeUser(tx, { name: 'Dad Jones' })
			await addRelationLabelImpl({ userId: userWithMom.id, input: { label: 'mother', targetUserId: someone.id }, dbx: tx })
			await addRelationLabelImpl({ userId: userWithFather.id, input: { label: 'father', targetUserId: dad.id }, dbx: tx })

			void userWithoutMom // intentionally has no labels
			const result = await parentalRemindersImpl({ db: tx, now: new Date('2026-05-03T12:00:00Z'), leadDays: 7 })
			expect(result.parentalReminderEmails).toBe(1)
			const recipients = sendStub.mock.calls.map(c => c[0])
			expect(recipients).toEqual([userWithMom.email])
		})
	})

	it('resolves dependent targets to their display name', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const dep = await makeDependent(tx, { name: 'Birth Mother', createdByUserId: user.id })
			await makeDependentGuardianship(tx, { guardianUserId: user.id, dependentId: dep.id })
			await addRelationLabelImpl({ userId: user.id, input: { label: 'mother', targetDependentId: dep.id }, dbx: tx })

			const result = await parentalRemindersImpl({ db: tx, now: new Date('2026-05-03T12:00:00Z'), leadDays: 7 })
			expect(result.parentalReminderEmails).toBe(1)
			const args = sendStub.mock.calls[0]
			expect(args[1].people).toEqual([{ name: 'Birth Mother' }])
		})
	})
})
