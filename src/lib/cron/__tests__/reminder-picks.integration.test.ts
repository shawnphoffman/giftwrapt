// Picks in relationship reminder emails: the reader's own copy carries up
// to three open things from the person's lists, built from the reader's
// gifter view, and guardian copies never carry them. The rendered email
// is covered in src/emails/__tests__/reminder-picks.test.tsx.

import { makeGiftedItem, makeGuardianship, makeItem, makeList, makeUser, makeUserRelationship } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it, vi } from 'vitest'

import { userRelationLabels } from '@/db/schema'

import { relationshipRemindersImpl } from '../relationship-reminders'
import { loadReminderPicks } from '../reminder-picks'

vi.mock('@/lib/resend', () => ({
	sendParentsDayReminderEmail: vi.fn(() => Promise.resolve(null)),
	sendPartnerAnniversaryReminderEmail: vi.fn(() => Promise.resolve(null)),
	sendValentinesDayReminderEmail: vi.fn(() => Promise.resolve(null)),
}))

// Image probing goes to the network; picks only need the mapping.
vi.mock('@/lib/email-images', () => ({
	resolveEmailImages: (urls: ReadonlyArray<string | null | undefined>) =>
		Promise.resolve(new Map(urls.filter((u): u is string => Boolean(u)).map(u => [u, u]))),
}))

const { sendParentsDayReminderEmail, sendValentinesDayReminderEmail } = await import('@/lib/resend')

const OFF = {
	relationshipRemindersCountry: 'US',
	enableMothersDayReminders: false,
	mothersDayReminderLeadDays: 7,
	enableMothersDayReminderEmails: false,
	enableFathersDayReminders: false,
	fathersDayReminderLeadDays: 7,
	enableFathersDayReminderEmails: false,
	enableValentinesDayReminders: false,
	valentinesDayReminderLeadDays: 7,
	enableValentinesDayReminderEmails: false,
	enableAnniversaryReminders: false,
	anniversaryReminderLeadDays: 7,
	enableAnniversaryReminderEmails: false,
}

// today + 7 == Feb 14, and == the second Sunday of May 2027.
const FEB_7 = new Date('2027-02-07T12:00:00Z')
const MAY_2 = new Date('2027-05-02T12:00:00Z')

describe('reminder picks', () => {
	it('adds open items from the partner’s list to a Valentine’s reminder, most wanted first', async () => {
		vi.mocked(sendValentinesDayReminderEmail).mockClear()
		await withRollback(async tx => {
			const a = await makeUser(tx, { name: 'Alex' })
			const b = await makeUser(tx, { name: 'Blair', partnerId: a.id })
			const other = await makeUser(tx, { name: 'Outsider' })
			const list = await makeList(tx, { ownerId: a.id, name: 'Alex Wishes', isPrimary: true })
			const scarf = await makeItem(tx, {
				listId: list.id,
				title: 'Scarf',
				price: '$35',
				priority: 'high',
				imageUrl: 'https://img.example/scarf.jpg',
			})
			await makeItem(tx, { listId: list.id, title: 'Mug' })
			const taken = await makeItem(tx, { listId: list.id, title: 'Already Taken', priority: 'very-high' })
			await makeGiftedItem(tx, { itemId: taken.id, gifterId: other.id })

			const settings = { ...OFF, enableValentinesDayReminders: true, enableValentinesDayReminderEmails: true, enableReminderPicks: true }
			await relationshipRemindersImpl({ db: tx, now: FEB_7, settings })

			const toBlair = vi.mocked(sendValentinesDayReminderEmail).mock.calls.find(([email]) => email === b.email)
			expect(toBlair?.[1].picks).toEqual([
				{
					personName: 'Alex',
					items: [
						{ title: 'Scarf', price: '$35', path: `/lists/${list.id}#item-${scarf.id}`, imageUrl: 'https://img.example/scarf.jpg' },
						expect.objectContaining({ title: 'Mug', imageUrl: null }),
					],
				},
			])
			// Alex has no partner pointing back, and nothing is sent about Alex's own list to Alex.
			expect(vi.mocked(sendValentinesDayReminderEmail).mock.calls.map(([email]) => email)).toEqual([b.email])
		})
	})

	it('sends the reminder unchanged when the switch is off or nothing is open', async () => {
		vi.mocked(sendValentinesDayReminderEmail).mockClear()
		await withRollback(async tx => {
			const a = await makeUser(tx, { name: 'Alex' })
			await makeUser(tx, { name: 'Blair', partnerId: a.id })
			const list = await makeList(tx, { ownerId: a.id, name: 'Alex Wishes', isPrimary: true })
			await makeItem(tx, { listId: list.id, title: 'Scarf' })
			const base = { ...OFF, enableValentinesDayReminders: true, enableValentinesDayReminderEmails: true }

			await relationshipRemindersImpl({ db: tx, now: FEB_7, settings: base })
			expect(vi.mocked(sendValentinesDayReminderEmail).mock.calls[0][1].picks).toBeUndefined()

			// On, but the partner has an empty list: still no picks key.
			vi.mocked(sendValentinesDayReminderEmail).mockClear()
			const c = await makeUser(tx, { name: 'Casey' })
			await makeUser(tx, { name: 'Drew', partnerId: c.id })
			await relationshipRemindersImpl({ db: tx, now: FEB_7, settings: { ...base, enableReminderPicks: true } })
			const toDrew = vi.mocked(sendValentinesDayReminderEmail).mock.calls.find(([, args]) => args.partnerName === 'Casey')
			expect(toDrew?.[1].picks).toBeUndefined()
		})
	})

	it('never puts picks on a guardian copy, which can reach the person the gift is for', async () => {
		vi.mocked(sendParentsDayReminderEmail).mockClear()
		await withRollback(async tx => {
			const mom = await makeUser(tx, { name: 'Mom' })
			const kid = await makeUser(tx, { name: 'Kid', role: 'child' })
			await makeGuardianship(tx, { parentUserId: mom.id, childUserId: kid.id })
			await tx.insert(userRelationLabels).values({ userId: kid.id, label: 'mother', targetUserId: mom.id })
			const list = await makeList(tx, { ownerId: mom.id, name: 'Mom Wishes', isPrimary: true })
			await makeItem(tx, { listId: list.id, title: 'Garden Gloves' })

			const settings = { ...OFF, enableMothersDayReminders: true, enableMothersDayReminderEmails: true, enableReminderPicks: true }
			await relationshipRemindersImpl({ db: tx, now: MAY_2, settings })

			const calls = vi.mocked(sendParentsDayReminderEmail).mock.calls
			const toKid = calls.find(([email]) => email === kid.email)
			const toMom = calls.find(([email]) => email === mom.email)
			expect(toKid?.[1].picks?.[0].items.map(i => i.title)).toEqual(['Garden Gloves'])
			// Mom is the kid's guardian and gets a copy of the reminder, without her own list in it.
			expect(toMom).toBeDefined()
			expect(toMom?.[1].picks).toBeUndefined()
		})
	})

	it('a restricted reader only gets picks they could see, and none for someone who shut them out', async () => {
		await withRollback(async tx => {
			const reader = await makeUser(tx, { name: 'Reader' })
			const owner = await makeUser(tx, { name: 'Owner' })
			const hidden = await makeUser(tx, { name: 'Hidden' })
			const outsider = await makeUser(tx, { name: 'Outsider' })
			const list = await makeList(tx, { ownerId: owner.id, name: 'Owner Wishes', isPrimary: true })
			await makeItem(tx, { listId: list.id, title: 'Open Thing' })
			const partly = await makeItem(tx, { listId: list.id, title: 'Partly Claimed By Outsider', quantity: 3, priority: 'very-high' })
			await makeGiftedItem(tx, { itemId: partly.id, gifterId: outsider.id })
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: reader.id, accessLevel: 'restricted' })
			const hiddenList = await makeList(tx, { ownerId: hidden.id, name: 'Hidden Wishes', isPrimary: true })
			await makeItem(tx, { listId: hiddenList.id, title: 'Unseen' })
			await makeUserRelationship(tx, { ownerUserId: hidden.id, viewerUserId: reader.id, accessLevel: 'none' })

			const picks = await loadReminderPicks({
				db: tx,
				viewerId: reader.id,
				people: [
					{ kind: 'user', id: owner.id, name: 'Owner' },
					{ kind: 'user', id: hidden.id, name: 'Hidden' },
				],
			})
			expect(picks).toEqual([{ personName: 'Owner', items: [expect.objectContaining({ title: 'Open Thing' })] }])
		})
	})
})
