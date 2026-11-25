// Everyone's Gift Exchange page (plan 39, slice 39d): what a member, a
// guardian and a stranger can read, and what counts as looking.

import { makeGiftedItem, makeGuardianship, makeItem, makeList, makeUser, makeUserRelationship } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { archiveExchangeImpl, createExchangeImpl, drawExchangeImpl, redrawExchangeImpl } from '@/api/_gift-exchanges-impl'
import { getPublicListsImpl } from '@/api/_lists-impl'
import {
	getMyExchangeCountImpl,
	getMyExchangesImpl,
	orderExchangeLists,
	revealChildAssignmentImpl,
	revealMyAssignmentImpl,
} from '@/api/_my-gift-exchanges-impl'
import type { SchemaDatabase } from '@/db'
import type { User } from '@/db/schema'
import { giftExchangeMembers } from '@/db/schema'

// ===============================
// Helpers
// ===============================

async function makePeople(tx: SchemaDatabase, names: Array<string>, role: 'user' | 'child' = 'user') {
	const out: Array<User> = []
	for (const name of names) out.push(await makeUser(tx, { name, role }))
	return out
}

async function drawnExchange(tx: SchemaDatabase, actorId: string, userIds: Array<string>, name = 'Family') {
	const res = await createExchangeImpl({
		now: new Date('2026-11-01T12:00:00Z'),
		actorId,
		input: { name, budget: 50, giftDate: '2026-12-25', memberUserIds: userIds },
		dbx: tx,
	})
	if (res.kind !== 'ok') throw new Error(`create failed: ${res.reason}`)
	const drawn = await drawExchangeImpl({ exchangeId: res.id, dbx: tx })
	if (drawn.kind !== 'ok') throw new Error(`draw failed: ${drawn.reason}`)
	return res.id
}

async function memberRows(tx: SchemaDatabase, exchangeId: string) {
	return tx.select().from(giftExchangeMembers).where(eq(giftExchangeMembers.exchangeId, exchangeId))
}

/** Forces a loop through the users in the order given, so tests know who has whom. */
async function forceLoop(tx: SchemaDatabase, exchangeId: string, userIds: Array<string>) {
	const rows = await memberRows(tx, exchangeId)
	const byUser = new Map(rows.map(r => [r.userId!, r.id]))
	for (let i = 0; i < userIds.length; i++) {
		const giver = byUser.get(userIds[i])!
		const recipient = byUser.get(userIds[(i + 1) % userIds.length])!
		await tx.update(giftExchangeMembers).set({ givesToMemberId: recipient }).where(eq(giftExchangeMembers.id, giver))
	}
}

async function memberFor(tx: SchemaDatabase, exchangeId: string, userId: string) {
	const rows = await memberRows(tx, exchangeId)
	return rows.find(r => r.userId === userId)!
}

// Everything identifying about a person that must not leak.
function traces(user: User): Array<string> {
	return [user.id, user.email, user.name!]
}

// ===============================
// Before and after looking
// ===============================

describe('getMyExchangesImpl', () => {
	it('sends nothing about the recipient before the member looks', async () => {
		await withRollback(async tx => {
			const [admin, ann, bea, cal] = await makePeople(tx, ['Admin Person', 'Ann Archer', 'Bea Baker', 'Cal Carter'])
			const exchangeId = await drawnExchange(tx, admin.id, [ann.id, bea.id, cal.id])
			await forceLoop(tx, exchangeId, [ann.id, bea.id, cal.id])

			const page = await getMyExchangesImpl({ userId: ann.id, dbx: tx })
			expect(page.exchanges).toHaveLength(1)
			expect(page.exchanges[0]).toMatchObject({ id: exchangeId, name: 'Family', budget: 50, giftDate: '2026-12-25', state: 'ready' })
			expect(page.exchanges[0].recipient).toBeNull()

			const serialised = JSON.stringify(page)
			for (const other of [bea, cal]) for (const t of traces(other)) expect(serialised).not.toContain(t)
		})
	})

	it('opening the page is not looking', async () => {
		await withRollback(async tx => {
			const [admin, ann, bea, cal] = await makePeople(tx, ['Admin', 'Ann', 'Bea', 'Cal'])
			const exchangeId = await drawnExchange(tx, admin.id, [ann.id, bea.id, cal.id])
			await getMyExchangesImpl({ userId: ann.id, dbx: tx })
			await getMyExchangeCountImpl({ userId: ann.id, dbx: tx })
			expect((await memberFor(tx, exchangeId, ann.id)).seenAt).toBeNull()
		})
	})

	it('shows the person and their lists once the member has looked', async () => {
		await withRollback(async tx => {
			const [admin, ann, bea, cal] = await makePeople(tx, ['Admin', 'Ann', 'Bea', 'Cal'])
			const exchangeId = await drawnExchange(tx, admin.id, [ann.id, bea.id, cal.id])
			await forceLoop(tx, exchangeId, [ann.id, bea.id, cal.id])
			const list = await makeList(tx, { ownerId: bea.id, name: 'Bea Wishes' })

			const reveal = await revealMyAssignmentImpl({ userId: ann.id, exchangeId, dbx: tx })
			expect(reveal).toEqual({ kind: 'ok', recipient: { id: bea.id, name: bea.name, email: bea.email, image: null } })

			const page = await getMyExchangesImpl({ userId: ann.id, dbx: tx })
			expect(page.exchanges[0].state).toBe('seen')
			expect(page.exchanges[0].recipient?.id).toBe(bea.id)
			expect(page.exchanges[0].recipient?.lists.map(l => l.id)).toEqual([list.id])
			// Only Ann's own pairing: Bea's and Cal's recipients stay out.
			const serialised = JSON.stringify(page)
			for (const t of traces(cal)) expect(serialised).not.toContain(t)
		})
	})

	it('lists only drawn, unarchived exchanges, soonest first, one person each', async () => {
		await withRollback(async tx => {
			const [admin, ann, bea, cal, dee] = await makePeople(tx, ['Admin', 'Ann', 'Bea', 'Cal', 'Dee'])
			const later = await drawnExchange(tx, admin.id, [ann.id, bea.id, cal.id], 'Later')
			const sooner = await createExchangeImpl({
				now: new Date('2026-11-01T12:00:00Z'),
				actorId: admin.id,
				input: { name: 'Sooner', budget: null, giftDate: '2026-12-01', memberUserIds: [ann.id, cal.id, dee.id] },
				dbx: tx,
			})
			if (sooner.kind !== 'ok') throw new Error('create failed')
			await drawExchangeImpl({ exchangeId: sooner.id, dbx: tx })
			// Never drawn: not on the page.
			await createExchangeImpl({
				now: new Date('2026-11-01T12:00:00Z'),
				actorId: admin.id,
				input: { name: 'Undrawn', budget: null, giftDate: '2026-11-30', memberUserIds: [ann.id, bea.id, dee.id] },
				dbx: tx,
			})

			const page = await getMyExchangesImpl({ userId: ann.id, dbx: tx })
			expect(page.exchanges.map(x => x.id)).toEqual([sooner.id, later])
			expect(page.exchanges[0].budget).toBeNull()
			expect(await getMyExchangeCountImpl({ userId: ann.id, dbx: tx })).toEqual({ count: 2 })
		})
	})
})

// ===============================
// Looking
// ===============================

describe('revealMyAssignmentImpl', () => {
	it('stamps seenAt once and clears changedAt', async () => {
		await withRollback(async tx => {
			const [admin, ann, bea, cal] = await makePeople(tx, ['Admin', 'Ann', 'Bea', 'Cal'])
			const exchangeId = await drawnExchange(tx, admin.id, [ann.id, bea.id, cal.id])
			const member = await memberFor(tx, exchangeId, ann.id)
			await tx.update(giftExchangeMembers).set({ changedAt: new Date() }).where(eq(giftExchangeMembers.id, member.id))

			await revealMyAssignmentImpl({ userId: ann.id, exchangeId, dbx: tx })
			const first = await memberFor(tx, exchangeId, ann.id)
			expect(first.seenAt).not.toBeNull()
			expect(first.changedAt).toBeNull()

			await new Promise(resolve => setTimeout(resolve, 10))
			await revealMyAssignmentImpl({ userId: ann.id, exchangeId, dbx: tx })
			const second = await memberFor(tx, exchangeId, ann.id)
			expect(second.seenAt?.getTime()).toBe(first.seenAt?.getTime())
		})
	})

	it('after a redraw the state is changed and the name is withheld until they look again', async () => {
		await withRollback(async tx => {
			const people = await makePeople(tx, ['Admin', 'Ann', 'Bea', 'Cal', 'Dee'])
			const [admin, ann, ...others] = people
			const exchangeId = await drawnExchange(tx, admin.id, [ann.id, ...others.map(o => o.id)])
			await revealMyAssignmentImpl({ userId: ann.id, exchangeId, dbx: tx })
			expect((await getMyExchangesImpl({ userId: ann.id, dbx: tx })).exchanges[0].recipient).not.toBeNull()

			const redraw = await redrawExchangeImpl({ exchangeId, dbx: tx })
			expect(redraw.kind).toBe('ok')

			const page = await getMyExchangesImpl({ userId: ann.id, dbx: tx })
			expect(page.exchanges[0].state).toBe('changed')
			expect(page.exchanges[0].recipient).toBeNull()
			const serialised = JSON.stringify(page)
			for (const other of others) for (const t of traces(other)) expect(serialised).not.toContain(t)

			const again = await revealMyAssignmentImpl({ userId: ann.id, exchangeId, dbx: tx })
			expect(again.kind).toBe('ok')
			const after = await getMyExchangesImpl({ userId: ann.id, dbx: tx })
			expect(after.exchanges[0].state).toBe('seen')
			expect(after.exchanges[0].recipient?.id).toBe(again.kind === 'ok' ? again.recipient.id : null)
		})
	})

	it('refuses a non-member, who also gets an empty page and a zero count', async () => {
		await withRollback(async tx => {
			const [admin, ann, bea, cal, stranger] = await makePeople(tx, ['Admin', 'Ann', 'Bea', 'Cal', 'Stranger'])
			const exchangeId = await drawnExchange(tx, admin.id, [ann.id, bea.id, cal.id])

			expect(await revealMyAssignmentImpl({ userId: stranger.id, exchangeId, dbx: tx })).toEqual({ kind: 'error', reason: 'not-member' })
			expect(await getMyExchangesImpl({ userId: stranger.id, dbx: tx })).toEqual({ exchanges: [], children: [] })
			expect(await getMyExchangeCountImpl({ userId: stranger.id, dbx: tx })).toEqual({ count: 0 })
			// The admin who set it up isn't a member either.
			expect(await revealMyAssignmentImpl({ userId: admin.id, exchangeId, dbx: tx })).toEqual({ kind: 'error', reason: 'not-member' })
		})
	})

	it('refuses an exchange that is not drawn yet', async () => {
		await withRollback(async tx => {
			const [admin, ann, bea, cal] = await makePeople(tx, ['Admin', 'Ann', 'Bea', 'Cal'])
			const res = await createExchangeImpl({
				now: new Date('2026-11-01T12:00:00Z'),
				actorId: admin.id,
				input: { name: 'Undrawn', budget: null, giftDate: '2026-12-25', memberUserIds: [ann.id, bea.id, cal.id] },
				dbx: tx,
			})
			if (res.kind !== 'ok') throw new Error('create failed')
			expect(await revealMyAssignmentImpl({ userId: ann.id, exchangeId: res.id, dbx: tx })).toEqual({ kind: 'error', reason: 'not-drawn' })
			expect(await getMyExchangeCountImpl({ userId: ann.id, dbx: tx })).toEqual({ count: 0 })
		})
	})
})

// ===============================
// Archive
// ===============================

describe('an archived exchange', () => {
	it('is gone from the page, the count and both reveals', async () => {
		await withRollback(async tx => {
			const [admin, guardian, ann, bea] = await makePeople(tx, ['Admin', 'Guardian', 'Ann', 'Bea'])
			const [kid] = await makePeople(tx, ['Kid'], 'child')
			await makeGuardianship(tx, { parentUserId: guardian.id, childUserId: kid.id })
			const exchangeId = await drawnExchange(tx, admin.id, [ann.id, bea.id, kid.id])
			await revealMyAssignmentImpl({ userId: ann.id, exchangeId, dbx: tx })
			expect(await getMyExchangeCountImpl({ userId: guardian.id, dbx: tx })).toEqual({ count: 1 })

			expect((await archiveExchangeImpl({ exchangeId, dbx: tx })).kind).toBe('ok')

			for (const user of [ann, guardian, kid]) {
				expect(await getMyExchangesImpl({ userId: user.id, dbx: tx })).toEqual({ exchanges: [], children: [] })
				expect(await getMyExchangeCountImpl({ userId: user.id, dbx: tx })).toEqual({ count: 0 })
			}
			expect(await revealMyAssignmentImpl({ userId: ann.id, exchangeId, dbx: tx })).toEqual({ kind: 'error', reason: 'archived' })
			expect(await revealChildAssignmentImpl({ userId: guardian.id, exchangeId, childUserId: kid.id, dbx: tx })).toEqual({
				kind: 'error',
				reason: 'archived',
			})
		})
	})
})

// ===============================
// Guardians
// ===============================

describe('revealChildAssignmentImpl', () => {
	it("lets a guardian see their own child's assignment, stamping seenAt without clearing changedAt", async () => {
		await withRollback(async tx => {
			const [admin, guardian, ann, bea] = await makePeople(tx, ['Admin', 'Guardian', 'Ann', 'Bea'])
			const [kid] = await makePeople(tx, ['Kid'], 'child')
			await makeGuardianship(tx, { parentUserId: guardian.id, childUserId: kid.id })
			const exchangeId = await drawnExchange(tx, admin.id, [kid.id, ann.id, bea.id], 'Cousins')
			await forceLoop(tx, exchangeId, [kid.id, ann.id, bea.id])
			const kidMember = await memberFor(tx, exchangeId, kid.id)
			const changedAt = new Date('2026-11-20T12:00:00Z')
			await tx.update(giftExchangeMembers).set({ changedAt }).where(eq(giftExchangeMembers.id, kidMember.id))

			// The guardian isn't in any exchange, and still gets the Children card and the link.
			const page = await getMyExchangesImpl({ userId: guardian.id, dbx: tx })
			expect(page.exchanges).toEqual([])
			expect(page.children).toEqual([
				{ exchangeId, exchangeName: 'Cousins', child: { id: kid.id, name: 'Kid', email: kid.email, image: null } },
			])
			// The Children card carries no pairing.
			for (const t of traces(ann)) expect(JSON.stringify(page)).not.toContain(t)
			expect(await getMyExchangeCountImpl({ userId: guardian.id, dbx: tx })).toEqual({ count: 1 })

			const result = await revealChildAssignmentImpl({ userId: guardian.id, exchangeId, childUserId: kid.id, dbx: tx })
			expect(result).toEqual({ kind: 'ok', recipient: { id: ann.id, name: ann.name, email: ann.email, image: null } })

			const after = await memberFor(tx, exchangeId, kid.id)
			expect(after.seenAt).not.toBeNull()
			expect(after.changedAt?.getTime()).toBe(changedAt.getTime())

			// The child's own page still says it changed, and withholds the name.
			const kidPage = await getMyExchangesImpl({ userId: kid.id, dbx: tx })
			expect(kidPage.exchanges[0].state).toBe('changed')
			expect(kidPage.exchanges[0].recipient).toBeNull()
		})
	})

	it("keeps the child's first seenAt", async () => {
		await withRollback(async tx => {
			const [admin, guardian, ann, bea] = await makePeople(tx, ['Admin', 'Guardian', 'Ann', 'Bea'])
			const [kid] = await makePeople(tx, ['Kid'], 'child')
			await makeGuardianship(tx, { parentUserId: guardian.id, childUserId: kid.id })
			const exchangeId = await drawnExchange(tx, admin.id, [kid.id, ann.id, bea.id])
			const seenAt = new Date('2026-11-21T09:00:00Z')
			const kidMember = await memberFor(tx, exchangeId, kid.id)
			await tx.update(giftExchangeMembers).set({ seenAt }).where(eq(giftExchangeMembers.id, kidMember.id))

			await revealChildAssignmentImpl({ userId: guardian.id, exchangeId, childUserId: kid.id, dbx: tx })
			expect((await memberFor(tx, exchangeId, kid.id)).seenAt?.getTime()).toBe(seenAt.getTime())
		})
	})

	it("refuses anyone else's child, and a child who isn't in the exchange", async () => {
		await withRollback(async tx => {
			const [admin, guardian, otherAdult, ann, bea] = await makePeople(tx, ['Admin', 'Guardian', 'Other Adult', 'Ann', 'Bea'])
			const [kid, otherKid] = await makePeople(tx, ['Kid', 'Other Kid'], 'child')
			await makeGuardianship(tx, { parentUserId: guardian.id, childUserId: kid.id })
			await makeGuardianship(tx, { parentUserId: otherAdult.id, childUserId: otherKid.id })
			const exchangeId = await drawnExchange(tx, admin.id, [kid.id, ann.id, bea.id])

			// Not their child.
			expect(await revealChildAssignmentImpl({ userId: otherAdult.id, exchangeId, childUserId: kid.id, dbx: tx })).toEqual({
				kind: 'error',
				reason: 'not-guardian',
			})
			// Another member is not a child of theirs either.
			expect(await revealChildAssignmentImpl({ userId: guardian.id, exchangeId, childUserId: ann.id, dbx: tx })).toEqual({
				kind: 'error',
				reason: 'not-guardian',
			})
			// Their own child, but not in this exchange.
			expect(await revealChildAssignmentImpl({ userId: otherAdult.id, exchangeId, childUserId: otherKid.id, dbx: tx })).toEqual({
				kind: 'error',
				reason: 'not-member',
			})
			// Nothing was stamped.
			expect((await memberFor(tx, exchangeId, kid.id)).seenAt).toBeNull()
			expect(await getMyExchangesImpl({ userId: otherAdult.id, dbx: tx })).toEqual({ exchanges: [], children: [] })
		})
	})

	it("works on a child member's own page", async () => {
		await withRollback(async tx => {
			const [admin, ann, bea] = await makePeople(tx, ['Admin', 'Ann', 'Bea'])
			const [kid] = await makePeople(tx, ['Kid'], 'child')
			const exchangeId = await drawnExchange(tx, admin.id, [kid.id, ann.id, bea.id])
			await forceLoop(tx, exchangeId, [kid.id, bea.id, ann.id])

			const before = await getMyExchangesImpl({ userId: kid.id, dbx: tx })
			expect(before.exchanges[0]).toMatchObject({ state: 'ready', recipient: null })
			const reveal = await revealMyAssignmentImpl({ userId: kid.id, exchangeId, dbx: tx })
			expect(reveal.kind === 'ok' && reveal.recipient.id).toBe(bea.id)
			const after = await getMyExchangesImpl({ userId: kid.id, dbx: tx })
			expect(after.exchanges[0]).toMatchObject({ state: 'seen' })
			expect(after.exchanges[0].recipient?.id).toBe(bea.id)
		})
	})
})

// ===============================
// The recipient's lists
// ===============================

describe("the recipient's lists", () => {
	async function seenSetup(tx: SchemaDatabase) {
		const [admin, ann, bea, cal] = await makePeople(tx, ['Admin', 'Ann', 'Bea', 'Cal'])
		const exchangeId = await drawnExchange(tx, admin.id, [ann.id, bea.id, cal.id])
		await forceLoop(tx, exchangeId, [ann.id, bea.id, cal.id])
		await revealMyAssignmentImpl({ userId: ann.id, exchangeId, dbx: tx })
		return { ann, bea, cal }
	}
	const recipientOf = async (tx: SchemaDatabase, userId: string) => (await getMyExchangesImpl({ userId, dbx: tx })).exchanges[0].recipient

	it('leaves out private lists, gift ideas and archived lists', async () => {
		await withRollback(async tx => {
			const { ann, bea } = await seenSetup(tx)
			const shown = await makeList(tx, { ownerId: bea.id, name: 'Public' })
			await makeList(tx, { ownerId: bea.id, name: 'Private', isPrivate: true })
			await makeList(tx, { ownerId: bea.id, name: 'Old', isActive: false })
			await makeList(tx, { ownerId: bea.id, name: 'Ideas', type: 'giftideas', isPrivate: true })
			expect((await recipientOf(tx, ann.id))?.lists.map(l => l.id)).toEqual([shown.id])
		})
	})

	it('is empty, with the person still shown, when they set the member to none after the draw', async () => {
		await withRollback(async tx => {
			const { ann, bea } = await seenSetup(tx)
			await makeList(tx, { ownerId: bea.id, name: 'Public' })
			await makeUserRelationship(tx, { ownerUserId: bea.id, viewerUserId: ann.id, accessLevel: 'none' })
			const recipient = await recipientOf(tx, ann.id)
			expect(recipient?.id).toBe(bea.id)
			expect(recipient?.lists).toEqual([])
		})
	})

	it('applies the restricted filter exactly as All Lists does', async () => {
		await withRollback(async tx => {
			const { ann, bea, cal } = await seenSetup(tx)
			const list = await makeList(tx, { ownerId: bea.id, name: 'Wishes' })
			const claimedByCal = await makeItem(tx, { listId: list.id })
			await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: claimedByCal.id, gifterId: cal.id })
			await makeUserRelationship(tx, { ownerUserId: bea.id, viewerUserId: ann.id, accessLevel: 'restricted' })

			const recipient = await recipientOf(tx, ann.id)
			const feedEntry = (await getPublicListsImpl(ann.id, tx)).find(u => u.id === bea.id)
			expect(recipient?.lists).toEqual(feedEntry?.lists)
			// Cal's claim is hidden from a restricted viewer: one item, still open.
			expect(recipient?.lists[0]).toMatchObject({ id: list.id, itemsTotal: 1, itemsRemaining: 1 })
		})
	})

	it('orders christmas lists first, then the primary list, then the rest', async () => {
		await withRollback(async tx => {
			const { ann, bea } = await seenSetup(tx)
			const wish = await makeList(tx, { ownerId: bea.id, name: 'Wish', createdAt: new Date('2026-01-03') })
			const primary = await makeList(tx, { ownerId: bea.id, name: 'Primary', isPrimary: true, createdAt: new Date('2026-01-01') })
			const christmas = await makeList(tx, { ownerId: bea.id, name: 'Christmas', type: 'christmas', createdAt: new Date('2026-01-02') })
			const birthday = await makeList(tx, { ownerId: bea.id, name: 'Birthday', type: 'birthday', createdAt: new Date('2026-01-04') })
			expect((await recipientOf(tx, ann.id))?.lists.map(l => l.id)).toEqual([christmas.id, primary.id, birthday.id, wish.id])
		})
	})
})

describe('orderExchangeLists', () => {
	it('keeps the feed order within each rank', () => {
		const lists = [
			{ id: 1, type: 'wishlist' as const, isPrimary: false },
			{ id: 2, type: 'christmas' as const, isPrimary: false },
			{ id: 3, type: 'wishlist' as const, isPrimary: true },
			{ id: 4, type: 'christmas' as const, isPrimary: true },
			{ id: 5, type: 'birthday' as const, isPrimary: false },
		]
		expect(orderExchangeLists(lists).map(l => l.id)).toEqual([2, 4, 3, 1, 5])
	})
})
