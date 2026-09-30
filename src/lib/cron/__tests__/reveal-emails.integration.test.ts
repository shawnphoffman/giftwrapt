// Integration coverage for the reveal email: a reveal emails exactly what it
// revealed (items and off-list gifts), once, one email per owner per run.
//
// Drives the real auto-archive impl and force-reveal impl against the seeded
// DB; only the Resend boundary is mocked. The regression this file exists
// for: a post-birthday summary that listed the recipient's Christmas gifts
// from the previous December, because the old summary selected every
// revealed gift on every list with no link to the reveal that triggered it.

import { makeGiftedItem, makeGuardianship, makeItem, makeList, makeListAddon, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'

import { forceArchiveListImpl } from '@/api/_archive-defer-impl'
import { archiveListPurchasesImpl } from '@/api/_items-extra-impl'
import type { SchemaDatabase } from '@/db'
import { appSettings, items, listAddons } from '@/db/schema'
import type { RevealSummarySection } from '@/emails/reveal-summary-email'

import { autoArchiveImpl } from '../auto-archive'
import { sendRevealEmails } from '../reveal-emails'

type RevealEmail = { subject: string; intro?: string; sections: Array<RevealSummarySection> }

vi.mock('@/lib/resend', () => ({
	sendRevealSummaryEmail: vi.fn((_to: string, _email: RevealEmail) => Promise.resolve(null)),
	isEmailConfigured: vi.fn(() => Promise.resolve(true)),
}))

const { sendRevealSummaryEmail } = await import('@/lib/resend')

const ALL_ON = { enableBirthdayEmails: true, enableChristmasEmails: true, enableGenericHolidayEmails: true }

// Owner born March 1, archive delay 7 days: March 8 is the reveal day.
const MARCH_8 = new Date('2026-03-08T12:00:00Z')

async function runCron(tx: SchemaDatabase, now: Date, overrides: Partial<Parameters<typeof autoArchiveImpl>[0]> = {}) {
	const result = await autoArchiveImpl({
		db: tx,
		now,
		archiveDaysAfterBirthday: 7,
		archiveDaysAfterChristmas: 14,
		archiveDaysAfterHoliday: 14,
		...overrides,
	})
	const sent = await sendRevealEmails(tx, result.revealed, ALL_ON)
	return { result, sent }
}

function sentEmails(): Array<{ to: string; email: RevealEmail }> {
	return vi.mocked(sendRevealSummaryEmail).mock.calls.map(([to, email]) => ({ to, email }))
}

function titles(email: RevealEmail): Array<string> {
	return email.sections.flatMap(s => s.items.map(i => i.title))
}

describe('reveal email - content is exactly what the reveal uncovered', () => {
	it('lists the claimed items and off-list gifts revealed by this run, and nothing else', async () => {
		vi.mocked(sendRevealSummaryEmail).mockClear()
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'R', birthMonth: 'march', birthDay: 1 })
			const gifter = await makeUser(tx, { name: 'Gifter' })

			const birthdayList = await makeList(tx, { ownerId: owner.id, type: 'birthday', name: 'Birthday' })
			const claimed = await makeItem(tx, { listId: birthdayList.id, title: 'Telescope' })
			await makeGiftedItem(tx, { itemId: claimed.id, gifterId: gifter.id })
			// Unclaimed: stays on the list, never revealed, never emailed.
			await makeItem(tx, { listId: birthdayList.id, title: 'Diary' })
			await makeListAddon(tx, { listId: birthdayList.id, userId: gifter.id, description: 'Homemade jam' })
			// Revealed by an earlier cycle: already archived, so not selected again.
			const lastYear = await makeItem(tx, {
				listId: birthdayList.id,
				title: 'Old Telescope',
				isArchived: true,
				archivedAt: new Date('2025-03-08T12:00:00Z'),
			})
			await makeGiftedItem(tx, { itemId: lastYear.id, gifterId: gifter.id })
			await makeListAddon(tx, { listId: birthdayList.id, userId: gifter.id, description: 'Old jam', isArchived: true })

			// Last December's Christmas gifts, revealed in January.
			const christmasList = await makeList(tx, { ownerId: owner.id, type: 'christmas', name: 'Christmas' })
			const slippers = await makeItem(tx, {
				listId: christmasList.id,
				title: 'Slippers',
				isArchived: true,
				archivedAt: new Date('2026-01-08T12:00:00Z'),
			})
			await makeGiftedItem(tx, { itemId: slippers.id, gifterId: gifter.id })

			const { sent } = await runCron(tx, MARCH_8)
			expect(sent).toBe(1)

			const emails = sentEmails()
			expect(emails).toHaveLength(1)
			expect(emails[0].to).toBe(owner.email)
			expect(emails[0].email.sections).toHaveLength(1)
			expect(emails[0].email.sections[0].listName).toBe('Birthday')
			expect(emails[0].email.sections[0].items).toEqual([
				expect.objectContaining({ title: 'Telescope', gifters: 'Gifter' }),
				expect.objectContaining({ title: 'Homemade jam', gifters: 'Gifter', offList: true }),
			])
		})
	})

	it('never emails the same gift twice: a second run reveals nothing and sends nothing', async () => {
		vi.mocked(sendRevealSummaryEmail).mockClear()
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const item = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			expect((await runCron(tx, MARCH_8)).sent).toBe(1)
			const second = await runCron(tx, MARCH_8)
			expect(second.result.revealed).toEqual([])
			expect(second.sent).toBe(0)
			expect(sendRevealSummaryEmail).toHaveBeenCalledTimes(1)
		})
	})

	it('follows the archive-days setting: the email goes out with the reveal, whatever the delay', async () => {
		// The old summary was hardcoded to birthday + 14 and found nothing when
		// the archive delay was longer.
		vi.mocked(sendRevealSummaryEmail).mockClear()
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const item = await makeItem(tx, { listId: list.id, title: 'Telescope' })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const day14 = await runCron(tx, new Date('2026-03-15T12:00:00Z'), { archiveDaysAfterBirthday: 21 })
			expect(day14.sent).toBe(0)
			const day21 = await runCron(tx, new Date('2026-03-22T12:00:00Z'), { archiveDaysAfterBirthday: 21 })
			expect(day21.sent).toBe(1)
			expect(titles(sentEmails()[0].email)).toEqual(['Telescope'])
		})
	})

	it('sends one email per owner covering every list revealed in the run', async () => {
		vi.mocked(sendRevealSummaryEmail).mockClear()
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const gifter = await makeUser(tx, { name: 'Gifter' })
			const birthdayList = await makeList(tx, { ownerId: owner.id, type: 'birthday', name: 'Birthday' })
			const wishlist = await makeList(tx, { ownerId: owner.id, type: 'wishlist', name: 'Wishlist' })
			const a = await makeItem(tx, { listId: birthdayList.id, title: 'Telescope' })
			const b = await makeItem(tx, { listId: wishlist.id, title: 'Hammock' })
			await makeGiftedItem(tx, { itemId: a.id, gifterId: gifter.id })
			await makeGiftedItem(tx, { itemId: b.id, gifterId: gifter.id })

			expect((await runCron(tx, MARCH_8)).sent).toBe(1)
			const emails = sentEmails()
			expect(emails).toHaveLength(1)
			expect(emails[0].email.sections.map(s => s.listName).sort()).toEqual(['Birthday', 'Wishlist'])
			expect(titles(emails[0].email).sort()).toEqual(['Hammock', 'Telescope'])
			expect(emails[0].email.intro).toBe('We hope you had a wonderful birthday.')
		})
	})

	it('lists items and off-list gifts in the Christmas email too', async () => {
		vi.mocked(sendRevealSummaryEmail).mockClear()
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx, { name: 'Gifter' })
			const list = await makeList(tx, { ownerId: owner.id, type: 'christmas', name: 'Christmas 2025' })
			const item = await makeItem(tx, { listId: list.id, title: 'Slippers' })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })
			await makeListAddon(tx, { listId: list.id, userId: gifter.id, description: 'Fudge' })

			// Dec 25 + 14 days.
			expect((await runCron(tx, new Date('2026-01-08T12:00:00Z'))).sent).toBe(1)
			const [{ email }] = sentEmails()
			expect(email.subject).toBe('A look back at your Christmas gifts')
			expect(email.intro).toBe('We hope your Christmas was wonderful.')
			expect(titles(email)).toEqual(['Slippers', 'Fudge'])
		})
	})
})

describe('reveal email - gating', () => {
	it('reveals but does not email when the list type toggle is off', async () => {
		vi.mocked(sendRevealSummaryEmail).mockClear()
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const item = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const result = await autoArchiveImpl({
				db: tx,
				now: MARCH_8,
				archiveDaysAfterBirthday: 7,
				archiveDaysAfterChristmas: 14,
				archiveDaysAfterHoliday: 14,
			})
			const sent = await sendRevealEmails(tx, result.revealed, { ...ALL_ON, enableBirthdayEmails: false })
			expect(sent).toBe(0)
			expect(sendRevealSummaryEmail).not.toHaveBeenCalled()
			const [row] = await tx.select({ isArchived: items.isArchived }).from(items).where(eq(items.id, item.id))
			expect(row.isArchived).toBe(true)
		})
	})

	it('does not email a banned owner', async () => {
		vi.mocked(sendRevealSummaryEmail).mockClear()
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1, banned: true })
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const item = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			expect((await runCron(tx, MARCH_8)).sent).toBe(0)
			expect(sendRevealSummaryEmail).not.toHaveBeenCalled()
		})
	})

	it("fans a child owner's email out to their guardians", async () => {
		vi.mocked(sendRevealSummaryEmail).mockClear()
		await withRollback(async tx => {
			const child = await makeUser(tx, { birthMonth: 'march', birthDay: 1, role: 'child' })
			const guardian = await makeUser(tx)
			await makeGuardianship(tx, { parentUserId: guardian.id, childUserId: child.id })
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: child.id, type: 'birthday' })
			const item = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			expect((await runCron(tx, MARCH_8)).sent).toBe(1)
			expect(
				sentEmails()
					.map(e => e.to)
					.sort()
			).toEqual([child.email, guardian.email].sort())
		})
	})
})

describe('reveal email - gifter attribution', () => {
	it('credits the partner of the gifter alongside the gifter', async () => {
		vi.mocked(sendRevealSummaryEmail).mockClear()
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const partnerOfGifter = await makeUser(tx, { name: 'Partner' })
			const gifter = await makeUser(tx, { name: 'Gifter', partnerId: partnerOfGifter.id })
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const item = await makeItem(tx, { listId: list.id, title: 'Hammock' })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			await runCron(tx, MARCH_8)
			expect(sentEmails()[0].email.sections[0].items[0].gifters).toBe('Gifter & Partner')
		})
	})

	it("does not name the recipient when the gifter is the recipient's partner", async () => {
		// Kate buys Jeff a birthday present. Jeff's summary must say
		// "From: Kate", not "From: Kate & Jeff" - he didn't gift himself.
		vi.mocked(sendRevealSummaryEmail).mockClear()
		await withRollback(async tx => {
			const jeff = await makeUser(tx, { name: 'Jeff', birthMonth: 'march', birthDay: 1 })
			const kate = await makeUser(tx, { name: 'Kate', partnerId: jeff.id })
			const list = await makeList(tx, { ownerId: jeff.id, type: 'birthday' })
			const item = await makeItem(tx, { listId: list.id, title: 'Hydro Flask' })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: kate.id })
			await makeListAddon(tx, { listId: list.id, userId: kate.id, description: 'Card' })

			await runCron(tx, MARCH_8)
			expect(sentEmails()[0].email.sections[0].items.map(i => i.gifters)).toEqual(['Kate', 'Kate'])
		})
	})

	it('does not name the recipient when only the recipient side names the partnership', async () => {
		// Partnership is a single nullable column (logic.md). Jeff naming Kate
		// as his partner, with Kate's row unset, must still keep Jeff out.
		vi.mocked(sendRevealSummaryEmail).mockClear()
		await withRollback(async tx => {
			const kate = await makeUser(tx, { name: 'Kate' })
			const jeff = await makeUser(tx, { name: 'Jeff', birthMonth: 'march', birthDay: 1, partnerId: kate.id })
			const list = await makeList(tx, { ownerId: jeff.id, type: 'birthday' })
			const item = await makeItem(tx, { listId: list.id, title: 'Hydro Flask' })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: kate.id })

			await runCron(tx, MARCH_8)
			expect(sentEmails()[0].email.sections[0].items[0].gifters).toBe('Kate')
		})
	})

	it('keeps two different items with the same title as separate rows', async () => {
		vi.mocked(sendRevealSummaryEmail).mockClear()
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const alice = await makeUser(tx, { name: 'Alice' })
			const bob = await makeUser(tx, { name: 'Bob' })
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const first = await makeItem(tx, { listId: list.id, title: 'Socks' })
			const second = await makeItem(tx, { listId: list.id, title: 'Socks' })
			await makeGiftedItem(tx, { itemId: first.id, gifterId: alice.id })
			await makeGiftedItem(tx, { itemId: second.id, gifterId: bob.id })

			await runCron(tx, MARCH_8)
			expect(sentEmails()[0].email.sections[0].items.map(i => i.gifters)).toEqual(['Alice', 'Bob'])
		})
	})
})

describe('reveal email - user-driven reveals', () => {
	it('force-reveal emails exactly what it revealed', async () => {
		vi.mocked(sendRevealSummaryEmail).mockClear()
		await withRollback(async tx => {
			await tx.insert(appSettings).values({ key: 'enableBirthdayEmails', value: true })
			// Default archive delay is 14 days, so March 8 is in the
			// post-birthday, pre-reveal gap where force-reveal is allowed.
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const gifter = await makeUser(tx, { name: 'Gifter' })
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const item = await makeItem(tx, { listId: list.id, title: 'Telescope' })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })
			const addon = await makeListAddon(tx, { listId: list.id, userId: gifter.id, description: 'Homemade jam' })

			const res = await forceArchiveListImpl({ userId: owner.id, input: { listId: list.id }, dbx: tx, now: MARCH_8 })
			expect(res).toEqual({ kind: 'ok', updated: 1, addonsArchived: 1, emailSent: true })
			expect(titles(sentEmails()[0].email)).toEqual(['Telescope', 'Homemade jam'])
			const [addonRow] = await tx.select({ isArchived: listAddons.isArchived }).from(listAddons).where(eq(listAddons.id, addon.id))
			expect(addonRow.isArchived).toBe(true)
		})
	})

	it('force-reveal with nothing to reveal sends no email', async () => {
		vi.mocked(sendRevealSummaryEmail).mockClear()
		await withRollback(async tx => {
			await tx.insert(appSettings).values({ key: 'enableBirthdayEmails', value: true })
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			await makeItem(tx, { listId: list.id })

			const res = await forceArchiveListImpl({ userId: owner.id, input: { listId: list.id }, dbx: tx, now: MARCH_8 })
			expect(res).toEqual({ kind: 'ok', updated: 0, addonsArchived: 0, emailSent: false })
			expect(sendRevealSummaryEmail).not.toHaveBeenCalled()
		})
	})

	it('the manual "archive all purchases" button reveals silently', async () => {
		vi.mocked(sendRevealSummaryEmail).mockClear()
		await withRollback(async tx => {
			await tx.insert(appSettings).values({ key: 'enableBirthdayEmails', value: true })
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'giftideas' })
			const item = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const res = await archiveListPurchasesImpl({ userId: owner.id, input: { listId: list.id }, dbx: tx })
			expect(res).toEqual({ kind: 'ok', updated: 1, addonsArchived: 0 })
			expect(sendRevealSummaryEmail).not.toHaveBeenCalled()
		})
	})
})
