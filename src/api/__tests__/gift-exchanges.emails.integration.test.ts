// Gift exchange emails (plan 39, slice 39c): "your assignment is ready" sent
// by hand with Send Emails, and "your assignment has changed" sent on its own
// after a redraw someone had looked at, a removal, or a late add.
//
// The impls run end to end against the seeded DB; only the mail transport
// (`@/lib/resend`) is stubbed. Assertions read who was emailed, in which
// language and wording, off the stub's calls, and render the real templates
// from those calls to check that no other person is named.

import { makeGuardianship, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq, inArray } from 'drizzle-orm'
import { createElement } from 'react'
import { render } from 'react-email'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
	addMembersImpl,
	createExchangeImpl,
	drawExchangeImpl,
	getExchangeForAdminImpl,
	redrawExchangeImpl,
	removeMemberImpl,
	sendReadyEmailsImpl,
} from '@/api/_gift-exchanges-impl'
import type { SchemaDatabase } from '@/db'
import { appSettings, giftExchangeMembers, users } from '@/db/schema'
import GiftExchangeChangedEmail from '@/emails/gift-exchange-changed-email'
import GiftExchangeReadyEmail from '@/emails/gift-exchange-ready-email'
import type { GiftExchangeEmailArgs } from '@/lib/resend'
import { DEFAULT_APP_SETTINGS } from '@/lib/settings'
import { getAppSettings } from '@/lib/settings-loader'

vi.setConfig({ testTimeout: 60_000 })

vi.mock('@/lib/resend', () => ({
	isEmailConfigured: vi.fn(),
	sendGiftExchangeReadyEmail: vi.fn(),
	sendGiftExchangeChangedEmail: vi.fn(),
}))

const { isEmailConfigured, sendGiftExchangeReadyEmail, sendGiftExchangeChangedEmail } = await import('@/lib/resend')

// What the provider answers. Only `error` matters to the code under test.
type SendResponse = Awaited<ReturnType<typeof sendGiftExchangeReadyEmail>>
const response = (body: { data: { id: string } | null; error: { message: string } | null }) =>
	Promise.resolve({ ...body, headers: null } as unknown as SendResponse)
const accepted = () => response({ data: { id: 'sent' }, error: null })
const rejected = () => response({ data: null, error: { message: 'rejected' } })

type Sent = { to: string; args: GiftExchangeEmailArgs }
const readySends = (): Array<Sent> => vi.mocked(sendGiftExchangeReadyEmail).mock.calls.map(([to, args]) => ({ to, args }))
const changedSends = (): Array<Sent> => vi.mocked(sendGiftExchangeChangedEmail).mock.calls.map(([to, args]) => ({ to, args }))
const sortedTo = (sends: Array<Sent>) => sends.map(s => s.to).sort()

beforeEach(() => {
	vi.mocked(sendGiftExchangeReadyEmail).mockReset().mockImplementation(accepted)
	vi.mocked(sendGiftExchangeChangedEmail).mockReset().mockImplementation(accepted)
	vi.mocked(isEmailConfigured).mockReset().mockResolvedValue(true)
})

// ===============================
// Helpers
// ===============================

async function setEmailsOn(tx: SchemaDatabase, on = true) {
	await tx
		.insert(appSettings)
		.values({ key: 'enableGiftExchangeEmails', value: on })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: on } })
}

async function makePeople(tx: SchemaDatabase, names: Array<string>) {
	const out = []
	for (const name of names) {
		out.push(await makeUser(tx, { name, email: `${name.toLowerCase().replace(/\s+/g, '.')}@test.local` }))
	}
	return out
}

async function create(tx: SchemaDatabase, actorId: string, userIds: Array<string>, budget: number | null = 40) {
	const res = await createExchangeImpl({
		actorId,
		input: { name: 'Family Swap', budget, giftDate: '2026-12-25', memberUserIds: userIds },
		dbx: tx,
	})
	if (res.kind !== 'ok') throw new Error(`create failed: ${res.reason}`)
	return res.id
}

async function memberRows(tx: SchemaDatabase, exchangeId: string) {
	return tx.select().from(giftExchangeMembers).where(eq(giftExchangeMembers.exchangeId, exchangeId))
}

async function memberIdByUser(tx: SchemaDatabase, exchangeId: string) {
	const rows = await memberRows(tx, exchangeId)
	return Object.fromEntries(rows.map(r => [r.userId!, r.id])) as Record<string, string>
}

async function setSeen(tx: SchemaDatabase, memberId: string) {
	await tx.update(giftExchangeMembers).set({ seenAt: new Date() }).where(eq(giftExchangeMembers.id, memberId))
}

async function forcePairing(tx: SchemaDatabase, pairs: Array<[string, string]>) {
	for (const [giver, recipient] of pairs) {
		await tx.update(giftExchangeMembers).set({ givesToMemberId: recipient }).where(eq(giftExchangeMembers.id, giver))
	}
}

function renderEmail(kind: 'ready' | 'changed', args: GiftExchangeEmailArgs, locale: 'en' | 'fr') {
	const props = { ...args, locale }
	return render(kind === 'ready' ? createElement(GiftExchangeReadyEmail, props) : createElement(GiftExchangeChangedEmail, props))
}

const text = (html: string) =>
	html
		.replace(/<!--.*?-->/g, '')
		.replace(/&#x27;/g, "'")
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')

// ===============================
// The switch
// ===============================

describe('enableGiftExchangeEmails', () => {
	it('defaults to off', async () => {
		expect(DEFAULT_APP_SETTINGS.enableGiftExchangeEmails).toBe(false)
		await withRollback(async tx => {
			expect((await getAppSettings(tx)).enableGiftExchangeEmails).toBe(false)
		})
	})

	it('off sends nothing, and everything else still works', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const people = await makePeople(tx, ['Ann One', 'Bob Two', 'Cat Three', 'Dan Four'])
			const id = await create(
				tx,
				admin.id,
				people.map(p => p.id)
			)
			expect(await drawExchangeImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'ok' })
			const m = await memberIdByUser(tx, id)
			await setSeen(tx, m[people[0].id])

			// Redraw after someone looked: pairings and the changed state still
			// update, but no email goes out and nobody counts as told.
			expect(await redrawExchangeImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'ok' })
			const rows = await memberRows(tx, id)
			expect(rows.every(r => r.changedAt !== null && r.seenAt === null && r.givesToMemberId !== null)).toBe(true)
			expect(rows.every(r => r.readyEmailSentAt === null)).toBe(true)

			// A removal still patches.
			expect((await removeMemberImpl({ input: { exchangeId: id, memberId: m[people[3].id] }, dbx: tx })).kind).toBe('ok')

			// Send Emails refuses with the reason and stamps nothing.
			expect(await sendReadyEmailsImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'error', reason: 'emails-off' })
			expect((await memberRows(tx, id)).every(r => r.readyEmailSentAt === null)).toBe(true)

			const read = await getExchangeForAdminImpl({ exchangeId: id, dbx: tx })
			if (read.kind !== 'ok') throw new Error('expected ok')
			expect(read.exchange.emailStatus).toBe('switched-off')
			expect(read.exchange.notEmailedCount).toBe(3)

			expect(readySends()).toEqual([])
			expect(changedSends()).toEqual([])
		})
	})

	it('without email configured, sends nothing and says why', async () => {
		vi.mocked(isEmailConfigured).mockResolvedValue(false)
		await withRollback(async tx => {
			await setEmailsOn(tx)
			const admin = await makeUser(tx, { role: 'admin' })
			const people = await makePeople(tx, ['Ann One', 'Bob Two', 'Cat Three'])
			const id = await create(
				tx,
				admin.id,
				people.map(p => p.id)
			)
			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			await setSeen(tx, (await memberIdByUser(tx, id))[people[0].id])
			expect(await redrawExchangeImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'ok' })
			expect(await sendReadyEmailsImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'error', reason: 'email-not-configured' })

			const read = await getExchangeForAdminImpl({ exchangeId: id, dbx: tx })
			if (read.kind !== 'ok') throw new Error('expected ok')
			expect(read.exchange.emailStatus).toBe('not-configured')
			expect(readySends()).toEqual([])
			expect(changedSends()).toEqual([])
		})
	})
})

// ===============================
// "Your assignment has changed"
// ===============================

describe('changed emails', () => {
	it('a redraw when nobody had looked sends nothing and keeps readyEmailSentAt', async () => {
		await withRollback(async tx => {
			await setEmailsOn(tx)
			const admin = await makeUser(tx, { role: 'admin' })
			const people = await makePeople(tx, ['Ann One', 'Bob Two', 'Cat Three', 'Dan Four'])
			const id = await create(
				tx,
				admin.id,
				people.map(p => p.id)
			)
			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			expect(await sendReadyEmailsImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'ok', sent: 4, failed: 0 })
			const stamped = (await memberRows(tx, id)).map(r => r.readyEmailSentAt)
			vi.mocked(sendGiftExchangeReadyEmail).mockClear()

			expect(await redrawExchangeImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'ok' })

			expect(changedSends()).toEqual([])
			expect(readySends()).toEqual([])
			const after = await memberRows(tx, id)
			expect(after.map(r => r.readyEmailSentAt)).toEqual(stamped)
			expect(after.every(r => r.changedAt === null)).toBe(true)
		})
	})

	it('a redraw after someone looked emails every member and stamps readyEmailSentAt', async () => {
		await withRollback(async tx => {
			await setEmailsOn(tx)
			const admin = await makeUser(tx, { role: 'admin' })
			const people = await makePeople(tx, ['Ann One', 'Bob Two', 'Cat Three', 'Dan Four'])
			const id = await create(
				tx,
				admin.id,
				people.map(p => p.id)
			)
			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			await setSeen(tx, (await memberIdByUser(tx, id))[people[1].id])

			expect(await redrawExchangeImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'ok' })

			expect(sortedTo(changedSends())).toEqual(people.map(p => p.email).sort())
			expect(readySends()).toEqual([])
			expect(changedSends()[0].args).toMatchObject({
				exchangeName: 'Family Swap',
				budget: 40,
				budgetCurrency: 'USD',
				giftDate: '2026-12-25',
			})
			expect((await memberRows(tx, id)).every(r => r.readyEmailSentAt !== null)).toBe(true)

			// They have been told, so Send Emails has nobody left.
			const read = await getExchangeForAdminImpl({ exchangeId: id, dbx: tx })
			if (read.kind !== 'ok') throw new Error('expected ok')
			expect(read.exchange.notEmailedCount).toBe(0)
			expect(await sendReadyEmailsImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'ok', sent: 0, failed: 0 })
			expect(readySends()).toEqual([])
		})
	})

	it('a removal emails only the person who now gifts to someone new', async () => {
		await withRollback(async tx => {
			await setEmailsOn(tx)
			const admin = await makeUser(tx, { role: 'admin' })
			const [a, b, c, d] = await makePeople(tx, ['Ann One', 'Bob Two', 'Cat Three', 'Dan Four'])
			const id = await create(tx, admin.id, [a.id, b.id, c.id, d.id])
			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			const m = await memberIdByUser(tx, id)
			await forcePairing(tx, [
				[m[a.id], m[b.id]],
				[m[b.id], m[c.id]],
				[m[c.id], m[d.id]],
				[m[d.id], m[a.id]],
			])

			// Ann had Bob; Bob leaves, so Ann now has Cat.
			expect(await removeMemberImpl({ input: { exchangeId: id, memberId: m[b.id] }, dbx: tx })).toEqual({ kind: 'ok' })

			expect(sortedTo(changedSends())).toEqual([a.email])
			const rows = await memberRows(tx, id)
			expect(rows.find(r => r.id === m[a.id])!.readyEmailSentAt).not.toBeNull()
			expect(rows.filter(r => r.id !== m[a.id]).every(r => r.readyEmailSentAt === null)).toBe(true)
		})
	})

	it('a late add emails only the person whose assignment moved to the newcomer', async () => {
		await withRollback(async tx => {
			await setEmailsOn(tx)
			const admin = await makeUser(tx, { role: 'admin' })
			const people = await makePeople(tx, ['Ann One', 'Bob Two', 'Cat Three'])
			const [zed] = await makePeople(tx, ['Zed Late'])
			const id = await create(
				tx,
				admin.id,
				people.map(p => p.id)
			)
			await drawExchangeImpl({ exchangeId: id, dbx: tx })

			expect(await addMembersImpl({ input: { exchangeId: id, userIds: [zed.id] }, dbx: tx })).toEqual({ kind: 'ok', added: 1 })

			const rows = await memberRows(tx, id)
			const changed = rows.filter(r => r.changedAt !== null)
			expect(changed).toHaveLength(1)
			const changedEmail = people.find(p => p.id === changed[0].userId)!.email
			expect(sortedTo(changedSends())).toEqual([changedEmail])
			// The newcomer is left for Send Emails.
			expect(rows.find(r => r.userId === zed.id)!.readyEmailSentAt).toBeNull()
			expect(readySends()).toEqual([])
		})
	})

	it("a failed send doesn't fail the action or stop the other sends", async () => {
		await withRollback(async tx => {
			await setEmailsOn(tx)
			const admin = await makeUser(tx, { role: 'admin' })
			const people = await makePeople(tx, ['Ann One', 'Bob Two', 'Cat Three'])
			const id = await create(
				tx,
				admin.id,
				people.map(p => p.id)
			)
			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			await setSeen(tx, (await memberIdByUser(tx, id))[people[0].id])
			vi.mocked(sendGiftExchangeChangedEmail).mockImplementation((to: string) =>
				to === people[1].email ? Promise.reject(new Error('provider down')) : accepted()
			)

			expect(await redrawExchangeImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'ok' })

			expect(sortedTo(changedSends())).toEqual(people.map(p => p.email).sort())
			const rows = await memberRows(tx, id)
			const byUser = new Map(rows.map(r => [r.userId, r]))
			expect(byUser.get(people[1].id)!.readyEmailSentAt).toBeNull()
			expect(byUser.get(people[0].id)!.readyEmailSentAt).not.toBeNull()
			expect(byUser.get(people[2].id)!.readyEmailSentAt).not.toBeNull()
		})
	})
})

// ===============================
// Send Emails
// ===============================

describe('Send Emails', () => {
	it('reaches only members not yet emailed, and a second press sends nothing', async () => {
		await withRollback(async tx => {
			await setEmailsOn(tx)
			const admin = await makeUser(tx, { role: 'admin' })
			const people = await makePeople(tx, ['Ann One', 'Bob Two', 'Cat Three', 'Dan Four'])
			const id = await create(
				tx,
				admin.id,
				people.map(p => p.id)
			)

			// Not before the draw.
			expect(await sendReadyEmailsImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'error', reason: 'not-drawn' })

			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			const m = await memberIdByUser(tx, id)
			await tx.update(giftExchangeMembers).set({ readyEmailSentAt: new Date() }).where(eq(giftExchangeMembers.id, m[people[0].id]))

			expect(await sendReadyEmailsImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'ok', sent: 3, failed: 0 })
			expect(sortedTo(readySends())).toEqual(
				people
					.slice(1)
					.map(p => p.email)
					.sort()
			)
			expect((await memberRows(tx, id)).every(r => r.readyEmailSentAt !== null)).toBe(true)

			vi.mocked(sendGiftExchangeReadyEmail).mockClear()
			expect(await sendReadyEmailsImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'ok', sent: 0, failed: 0 })
			expect(readySends()).toEqual([])
			expect(changedSends()).toEqual([])
		})
	})

	it('leaves a failed send unstamped so the next press retries it', async () => {
		await withRollback(async tx => {
			await setEmailsOn(tx)
			const admin = await makeUser(tx, { role: 'admin' })
			const people = await makePeople(tx, ['Ann One', 'Bob Two', 'Cat Three'])
			const id = await create(
				tx,
				admin.id,
				people.map(p => p.id)
			)
			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			vi.mocked(sendGiftExchangeReadyEmail).mockImplementation((to: string) => (to === people[2].email ? rejected() : accepted()))

			expect(await sendReadyEmailsImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'ok', sent: 2, failed: 1 })
			const read = await getExchangeForAdminImpl({ exchangeId: id, dbx: tx })
			if (read.kind !== 'ok') throw new Error('expected ok')
			expect(read.exchange.notEmailedCount).toBe(1)
			expect(read.exchange.notEmailedMemberId).toBe((await memberIdByUser(tx, id))[people[2].id])

			vi.mocked(sendGiftExchangeReadyEmail).mockReset().mockImplementation(accepted)
			expect(await sendReadyEmailsImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'ok', sent: 1, failed: 0 })
			expect(sortedTo(readySends())).toEqual([people[2].email])
		})
	})

	it('refuses an archived exchange', async () => {
		await withRollback(async tx => {
			await setEmailsOn(tx)
			const admin = await makeUser(tx, { role: 'admin' })
			const people = await makePeople(tx, ['Ann One', 'Bob Two', 'Cat Three'])
			const id = await create(
				tx,
				admin.id,
				people.map(p => p.id)
			)
			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			const { archiveExchangeImpl } = await import('@/api/_gift-exchanges-impl')
			await archiveExchangeImpl({ exchangeId: id, dbx: tx })
			expect(await sendReadyEmailsImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'error', reason: 'archived' })
			expect(readySends()).toEqual([])
		})
	})
})

// ===============================
// Recipients
// ===============================

describe('recipients', () => {
	it('skips banned members, and leaves them out of the not-emailed count', async () => {
		await withRollback(async tx => {
			await setEmailsOn(tx)
			const admin = await makeUser(tx, { role: 'admin' })
			const people = await makePeople(tx, ['Ann One', 'Bob Two', 'Cat Three', 'Dan Four'])
			const id = await create(
				tx,
				admin.id,
				people.map(p => p.id)
			)
			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			// Banned after being added: they stay in the exchange until removed.
			await tx.update(users).set({ banned: true }).where(eq(users.id, people[3].id))

			const before = await getExchangeForAdminImpl({ exchangeId: id, dbx: tx })
			if (before.kind !== 'ok') throw new Error('expected ok')
			expect(before.exchange.notEmailedCount).toBe(3)

			expect(await sendReadyEmailsImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'ok', sent: 3, failed: 0 })
			expect(readySends().map(s => s.to)).not.toContain(people[3].email)

			await setSeen(tx, (await memberIdByUser(tx, id))[people[0].id])
			await redrawExchangeImpl({ exchangeId: id, dbx: tx })
			expect(sortedTo(changedSends())).toEqual(
				people
					.slice(0, 3)
					.map(p => p.email)
					.sort()
			)

			const banned = (await memberRows(tx, id)).find(r => r.userId === people[3].id)!
			expect(banned.readyEmailSentAt).toBeNull()
			const after = await getExchangeForAdminImpl({ exchangeId: id, dbx: tx })
			if (after.kind !== 'ok') throw new Error('expected ok')
			expect(after.exchange.notEmailedCount).toBe(0)
		})
	})

	it("copies a child's email to each guardian, in the guardian's language and worded about the child", async () => {
		await withRollback(async tx => {
			await setEmailsOn(tx)
			const admin = await makeUser(tx, { role: 'admin' })
			const [mum, dad, other] = await makePeople(tx, ['Mona Parent', 'Dave Parent', 'Olga Other'])
			const sam = await makeUser(tx, { name: 'Sam Kid', email: 'sam.kid@test.local', role: 'child' })
			await makeGuardianship(tx, { parentUserId: mum.id, childUserId: sam.id })
			await makeGuardianship(tx, { parentUserId: dad.id, childUserId: sam.id })
			await tx.update(users).set({ locale: 'fr' }).where(eq(users.id, mum.id))
			await tx
				.update(users)
				.set({ locale: 'en' })
				.where(inArray(users.id, [dad.id, sam.id]))
			// The guardians aren't in the exchange; Sam, Olga and Ann are.
			const [ann] = await makePeople(tx, ['Ann One'])
			const id = await create(tx, admin.id, [sam.id, other.id, ann.id])
			await drawExchangeImpl({ exchangeId: id, dbx: tx })

			expect(await sendReadyEmailsImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'ok', sent: 3, failed: 0 })

			const sends = readySends()
			expect(sortedTo(sends)).toEqual([ann.email, dad.email, mum.email, other.email, sam.email].sort())
			const to = (email: string) => sends.find(s => s.to === email)!.args
			expect(to(sam.email)).toMatchObject({ childName: null, locale: 'en' })
			expect(to(mum.email)).toMatchObject({ childName: 'Sam Kid', locale: 'fr' })
			expect(to(dad.email)).toMatchObject({ childName: 'Sam Kid', locale: 'en' })

			const frHtml = text(await renderEmail('ready', to(mum.email), 'fr'))
			expect(frHtml).toContain('Le tirage de Sam Kid est prêt')
			const enHtml = text(await renderEmail('ready', to(dad.email), 'en'))
			expect(enHtml).toContain("Sam Kid's assignment is ready")
		})
	})
})

// ===============================
// No names
// ===============================

describe('no other person is named', () => {
	it('neither email, in either language, names anyone but the reader', async () => {
		await withRollback(async tx => {
			await setEmailsOn(tx)
			const admin = await makeUser(tx, { role: 'admin', name: 'Adele Organizer' })
			const people = await makePeople(tx, ['Priya Raman', 'Quentin Blake', 'Rosa Diaz', 'Silas Marner'])
			const kid = await makeUser(tx, { name: 'Tilly Young', email: 'tilly@test.local', role: 'child' })
			const guardian = await makeUser(tx, { name: 'Gina Guard', email: 'gina@test.local' })
			await makeGuardianship(tx, { parentUserId: guardian.id, childUserId: kid.id })
			const everyone = [...people, kid]
			const id = await create(
				tx,
				admin.id,
				everyone.map(p => p.id)
			)
			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			await sendReadyEmailsImpl({ exchangeId: id, dbx: tx })
			await setSeen(tx, (await memberIdByUser(tx, id))[people[0].id])
			await redrawExchangeImpl({ exchangeId: id, dbx: tx })

			const allNames = [...everyone, admin, guardian].map(p => p.name!)
			const nameParts = allNames.flatMap(n => n.split(' '))
			const cases: Array<{ kind: 'ready' | 'changed'; send: Sent }> = [
				...readySends().map(send => ({ kind: 'ready' as const, send })),
				...changedSends().map(send => ({ kind: 'changed' as const, send })),
			]
			// Every member and the guardian, for each email.
			expect(cases).toHaveLength(2 * (everyone.length + 1))

			for (const { kind, send } of cases) {
				// The only name an email may carry is the child it is about, on a guardian's copy.
				const allowed = send.args.childName ? send.args.childName.split(' ') : []
				const forbidden = nameParts.filter(part => !allowed.includes(part))
				expect(JSON.stringify(send.args)).not.toMatch(new RegExp(forbidden.join('|')))
				for (const locale of ['en', 'fr'] as const) {
					const body = text(await renderEmail(kind, send.args, locale))
					expect(body).toContain('Family Swap')
					for (const part of forbidden) expect(body, `${kind} ${locale} to ${send.to}`).not.toContain(part)
				}
			}
		})
	})
})
