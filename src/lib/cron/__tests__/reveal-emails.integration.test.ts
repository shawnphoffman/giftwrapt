// Integration coverage for the reveal email: a reveal emails exactly what it
// revealed (items and off-list gifts), once, one email per owner per run.
//
// Drives the real auto-archive impl and force-reveal impl against the seeded
// DB; only the Resend boundary is mocked. The regression this file exists
// for: a post-birthday summary that listed the recipient's Christmas gifts
// from the previous December, because the old summary selected every
// revealed gift on every list with no link to the reveal that triggered it.

import {
	makeDependent,
	makeDependentGuardianship,
	makeGiftedItem,
	makeGuardianship,
	makeItem,
	makeList,
	makeListAddon,
	makeUser,
} from '@test/integration/factories'
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

// Image probing is network I/O; stand in for it with a rule: URLs containing
// "gone" fail, everything else loads.
vi.mock('@/lib/email-images', () => ({
	resolveEmailImages: (urls: ReadonlyArray<string | null | undefined>) =>
		Promise.resolve(new Map(urls.filter((u): u is string => !!u).map(u => [u, u.includes('gone') ? null : u]))),
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
			expect(emails[0].email.intro).toBe("We hope you had a wonderful birthday. Here's who gave you what.")
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
			expect(email.intro).toBe("We hope your Christmas was wonderful. Here's who gave you what.")
			expect(titles(email)).toEqual(['Slippers', 'Fudge'])
		})
	})
})

describe('reveal email - images', () => {
	it('sends null for missing or unloadable images so the template shows the placeholder', async () => {
		vi.mocked(sendRevealSummaryEmail).mockClear()
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const noImage = await makeItem(tx, { listId: list.id, title: 'No image', imageUrl: null })
			const ok = await makeItem(tx, { listId: list.id, title: 'Loads', imageUrl: 'https://vendor.test/ok.jpg' })
			const broken = await makeItem(tx, { listId: list.id, title: 'Broken', imageUrl: 'https://vendor.test/gone.jpg' })
			for (const item of [noImage, ok, broken]) await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })
			await makeListAddon(tx, { listId: list.id, userId: gifter.id, description: 'Jam', imageUrl: 'https://vendor.test/gone.png' })

			await runCron(tx, MARCH_8)
			const rows = sentEmails()[0].email.sections[0].items
			expect(rows.map(r => [r.title, r.image_url])).toEqual([
				['No image', null],
				['Loads', 'https://vendor.test/ok.jpg'],
				['Broken', null],
				['Jam', null],
			])
		})
	})
})

describe('reveal email - lists for a dependent', () => {
	it("reveals on the dependent's birthday and emails every guardian, naming the dependent", async () => {
		vi.mocked(sendRevealSummaryEmail).mockClear()
		await withRollback(async tx => {
			// Guardian A's birthday is today's trigger date too, which must not
			// matter: the list follows Fido's birthday (March 1), not A's.
			const guardianA = await makeUser(tx, { name: 'A', birthMonth: 'march', birthDay: 1 })
			const guardianB = await makeUser(tx, { name: 'B' })
			const fido = await makeDependent(tx, { name: 'Fido', birthMonth: 'march', birthDay: 1, createdByUserId: guardianA.id })
			await makeDependentGuardianship(tx, { guardianUserId: guardianA.id, dependentId: fido.id })
			await makeDependentGuardianship(tx, { guardianUserId: guardianB.id, dependentId: fido.id })
			const gifter = await makeUser(tx, { name: 'Gifter' })
			const list = await makeList(tx, { ownerId: guardianA.id, type: 'birthday', subjectDependentId: fido.id, name: "Fido's Birthday" })
			const item = await makeItem(tx, { listId: list.id, title: 'Chew toy' })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })
			// Guardian A is a gifter too: on a dependent's list the owner is not
			// the recipient, so A is credited by name.
			const bed = await makeItem(tx, { listId: list.id, title: 'Dog bed' })
			await makeGiftedItem(tx, { itemId: bed.id, gifterId: guardianA.id })

			const { result, sent } = await runCron(tx, MARCH_8)
			expect(result.revealed).toHaveLength(1)
			expect(result.revealed[0]).toMatchObject({ listId: list.id, subjectDependentId: fido.id, family: 'birthday' })
			expect(sent).toBe(2)
			const emails = sentEmails()
			expect(emails.map(e => e.to).sort()).toEqual([guardianA.email, guardianB.email].sort())
			for (const { email } of emails) {
				expect(email.subject).toBe("A look back at Fido's gifts")
				expect(email.intro).toBe("We hope Fido had a wonderful birthday. Here's who gave Fido what.")
				expect(email.sections[0].items.map(i => [i.title, i.gifters])).toEqual([
					['Chew toy', 'Gifter'],
					['Dog bed', 'A'],
				])
			}
		})
	})

	it("does not reveal a dependent's list on a guardian's birthday", async () => {
		vi.mocked(sendRevealSummaryEmail).mockClear()
		await withRollback(async tx => {
			const guardian = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const fido = await makeDependent(tx, { name: 'Fido', birthMonth: 'october', birthDay: 20, createdByUserId: guardian.id })
			await makeDependentGuardianship(tx, { guardianUserId: guardian.id, dependentId: fido.id })
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: guardian.id, type: 'birthday', subjectDependentId: fido.id })
			const item = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const { result, sent } = await runCron(tx, MARCH_8)
			expect(result.revealed).toEqual([])
			expect(sent).toBe(0)
			const [row] = await tx.select({ isArchived: items.isArchived }).from(items).where(eq(items.id, item.id))
			expect(row.isArchived).toBe(false)
		})
	})

	it("reveals a dependent's Christmas list with everyone else's", async () => {
		vi.mocked(sendRevealSummaryEmail).mockClear()
		await withRollback(async tx => {
			const guardian = await makeUser(tx, { name: 'G' })
			const fido = await makeDependent(tx, { name: 'Fido', createdByUserId: guardian.id })
			await makeDependentGuardianship(tx, { guardianUserId: guardian.id, dependentId: fido.id })
			const gifter = await makeUser(tx, { name: 'Gifter' })
			const list = await makeList(tx, { ownerId: guardian.id, type: 'christmas', subjectDependentId: fido.id })
			const item = await makeItem(tx, { listId: list.id, title: 'Antlers' })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			expect((await runCron(tx, new Date('2026-01-08T12:00:00Z'))).sent).toBe(1)
			const [{ to, email }] = sentEmails()
			expect(to).toBe(guardian.email)
			expect(email.subject).toBe("A look back at Fido's Christmas gifts")
			expect(email.intro).toBe("We hope Fido's Christmas was wonderful. Here's who gave Fido what.")
			expect(titles(email)).toEqual(['Antlers'])
		})
	})

	it("a guardian's own list and a dependent's list revealed together make one email", async () => {
		vi.mocked(sendRevealSummaryEmail).mockClear()
		await withRollback(async tx => {
			const guardian = await makeUser(tx, { name: 'G', birthMonth: 'march', birthDay: 1 })
			const fido = await makeDependent(tx, { name: 'Fido', birthMonth: 'march', birthDay: 1, createdByUserId: guardian.id })
			await makeDependentGuardianship(tx, { guardianUserId: guardian.id, dependentId: fido.id })
			const gifter = await makeUser(tx, { name: 'Gifter' })
			const own = await makeList(tx, { ownerId: guardian.id, type: 'birthday', name: 'Mine' })
			const fidos = await makeList(tx, { ownerId: guardian.id, type: 'birthday', subjectDependentId: fido.id, name: "Fido's" })
			const a = await makeItem(tx, { listId: own.id, title: 'Telescope' })
			const b = await makeItem(tx, { listId: fidos.id, title: 'Chew toy' })
			await makeGiftedItem(tx, { itemId: a.id, gifterId: gifter.id })
			await makeGiftedItem(tx, { itemId: b.id, gifterId: gifter.id })

			expect((await runCron(tx, MARCH_8)).sent).toBe(1)
			const [{ email }] = sentEmails()
			expect(email.subject).toBe('A look back at your gifts')
			expect(email.intro).toBe("Here's who gave what.")
			expect(email.sections.map(s => s.listName).sort()).toEqual(["Fido's", 'Mine'])
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
