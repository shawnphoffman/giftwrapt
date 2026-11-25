import { makeGuardianship, makeUser, makeUserRelationship } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import {
	addMembersImpl,
	archiveExchangeImpl,
	createExchangeImpl,
	deleteExchangeImpl,
	drawExchangeImpl,
	getExchangeForAdminImpl,
	listExchangesImpl,
	redrawExchangeImpl,
	removeMemberImpl,
	saveMemberRulesImpl,
	updateExchangeImpl,
} from '@/api/_gift-exchanges-impl'
import { deleteUserAsAdminImpl } from '@/api/admin'
import type { SchemaDatabase } from '@/db'
import { giftExchangeBlocks, giftExchangeMembers, giftExchanges } from '@/db/schema'

// ===============================
// Helpers
// ===============================

async function makeUsers(tx: SchemaDatabase, n: number) {
	const out = []
	for (let i = 0; i < n; i++) out.push(await makeUser(tx))
	return out
}

async function create(tx: SchemaDatabase, actorId: string, userIds: Array<string>, budget: number | null = null) {
	const res = await createExchangeImpl({
		now: new Date('2026-11-01T12:00:00Z'),
		actorId,
		input: { name: 'Family', budget, giftDate: '2026-12-25', memberUserIds: userIds },
		dbx: tx,
	})
	if (res.kind !== 'ok') throw new Error(`create failed: ${res.reason}`)
	return res.id
}

async function members(tx: SchemaDatabase, exchangeId: string) {
	return tx.select().from(giftExchangeMembers).where(eq(giftExchangeMembers.exchangeId, exchangeId))
}

async function memberOf(tx: SchemaDatabase, exchangeId: string) {
	const rows = await members(tx, exchangeId)
	return Object.fromEntries(rows.map(r => [r.userId!, r.id])) as Record<string, string>
}

// Every member gifts to exactly one other member, and is gifted to by exactly one.
async function expectPerfectPairing(tx: SchemaDatabase, exchangeId: string) {
	const rows = await members(tx, exchangeId)
	const ids = new Set(rows.map(r => r.id))
	const recipients = rows.map(r => r.givesToMemberId)
	for (const r of rows) {
		expect(r.givesToMemberId).not.toBeNull()
		expect(r.givesToMemberId).not.toBe(r.id)
		expect(ids.has(r.givesToMemberId!)).toBe(true)
	}
	expect(new Set(recipients).size).toBe(rows.length)
	return rows
}

async function setSeen(tx: SchemaDatabase, memberId: string) {
	await tx.update(giftExchangeMembers).set({ seenAt: new Date() }).where(eq(giftExchangeMembers.id, memberId))
}

async function exchangeRow(tx: SchemaDatabase, exchangeId: string) {
	const [row] = await tx.select().from(giftExchanges).where(eq(giftExchanges.id, exchangeId))
	return row
}

// Forces a specific pairing, for tests that need to know who has whom.
async function forcePairing(tx: SchemaDatabase, pairs: Array<[string, string]>) {
	for (const [giver, recipient] of pairs) {
		await tx.update(giftExchangeMembers).set({ givesToMemberId: recipient }).where(eq(giftExchangeMembers.id, giver))
	}
}

// ===============================
// Create, list, update, delete, archive
// ===============================

describe('createExchangeImpl', () => {
	it('creates an exchange with members and copies the default currency with a budget', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const [a, b] = await makeUsers(tx, 2)
			const id = await create(tx, admin.id, [a.id, b.id, a.id], 50)
			const row = await exchangeRow(tx, id)
			expect(row.budget).toBe('50.00')
			expect(row.budgetCurrency).toBe('USD')
			expect(row.createdByUserId).toBe(admin.id)
			expect(await members(tx, id)).toHaveLength(2)
		})
	})

	it('stores no currency without a budget', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const id = await create(tx, admin.id, [])
			expect((await exchangeRow(tx, id)).budgetCurrency).toBeNull()
		})
	})

	it('refuses a banned user', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const banned = await makeUser(tx, { banned: true })
			const res = await createExchangeImpl({
				now: new Date('2026-11-01T12:00:00Z'),
				actorId: admin.id,
				input: { name: 'X', budget: null, giftDate: '2026-12-25', memberUserIds: [banned.id] },
				dbx: tx,
			})
			expect(res).toEqual({ kind: 'error', reason: 'user-banned' })
		})
	})
})

describe('listExchangesImpl', () => {
	it('lists running exchanges before archived ones, with state and member count', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 3)
			const archived = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			await drawExchangeImpl({ exchangeId: archived, dbx: tx })
			await archiveExchangeImpl({ exchangeId: archived, dbx: tx })
			const open = await create(tx, admin.id, [users[0].id])
			const list = await listExchangesImpl({ dbx: tx })
			expect(list.map(e => e.id)).toEqual([open, archived])
			expect(list[0]).toMatchObject({ state: 'not-drawn', memberCount: 1 })
			expect(list[1]).toMatchObject({ state: 'archived', memberCount: 3 })
		})
	})
})

describe('updateExchangeImpl', () => {
	it('updates details and refuses an archived exchange', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 3)
			const id = await create(
				tx,
				admin.id,
				users.map(u => u.id),
				20
			)
			const res = await updateExchangeImpl({
				now: new Date('2026-11-01T12:00:00Z'),
				input: { exchangeId: id, name: 'Renamed', budget: null, giftDate: '2026-12-24' },
				dbx: tx,
			})
			expect(res).toEqual({ kind: 'ok' })
			const row = await exchangeRow(tx, id)
			expect(row).toMatchObject({ name: 'Renamed', budget: null, budgetCurrency: null, giftDate: '2026-12-24' })

			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			await archiveExchangeImpl({ exchangeId: id, dbx: tx })
			const after = await updateExchangeImpl({
				now: new Date('2026-11-01T12:00:00Z'),
				input: { exchangeId: id, name: 'Nope', budget: null, giftDate: '2026-12-24' },
				dbx: tx,
			})
			expect(after).toEqual({ kind: 'error', reason: 'archived' })
		})
	})
})

describe('deleteExchangeImpl', () => {
	it('deletes a never-drawn exchange and refuses a drawn one', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 3)
			const notDrawn = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			expect(await deleteExchangeImpl({ exchangeId: notDrawn, dbx: tx })).toEqual({ kind: 'ok' })
			expect(await exchangeRow(tx, notDrawn)).toBeUndefined()

			const drawn = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			await drawExchangeImpl({ exchangeId: drawn, dbx: tx })
			expect(await deleteExchangeImpl({ exchangeId: drawn, dbx: tx })).toEqual({ kind: 'error', reason: 'already-drawn' })
		})
	})
})

describe('archiveExchangeImpl', () => {
	it('requires a draw and is final', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 3)
			const id = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			expect(await archiveExchangeImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'error', reason: 'not-drawn' })
			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			expect(await archiveExchangeImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'ok' })
			expect(await archiveExchangeImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'error', reason: 'archived' })
			expect(await redrawExchangeImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'error', reason: 'archived' })
			const [m] = await members(tx, id)
			expect(await removeMemberImpl({ input: { exchangeId: id, memberId: m.id }, dbx: tx })).toEqual({ kind: 'error', reason: 'archived' })
		})
	})
})

// ===============================
// Draw and redraw
// ===============================

describe('drawExchangeImpl', () => {
	it('writes a full pairing and stamps drawnAt', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 5)
			const id = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			expect(await drawExchangeImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'ok' })
			expect((await exchangeRow(tx, id)).drawnAt).not.toBeNull()
			await expectPerfectPairing(tx, id)
			expect(await drawExchangeImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'error', reason: 'already-drawn' })
		})
	})

	it('refuses fewer than three people', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 2)
			const id = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			const res = await drawExchangeImpl({ exchangeId: id, dbx: tx })
			expect(res).toMatchObject({ kind: 'error', reason: 'no-valid-draw', problem: { reason: 'too-few-members', memberCount: 2 } })
			expect((await exchangeRow(tx, id)).drawnAt).toBeNull()
		})
	})

	it('never pairs a blocked or locked direction', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const guardian = await makeUser(tx)
			const child = await makeUser(tx, { role: 'child' })
			const [a, b] = await makeUsers(tx, 2)
			await makeGuardianship(tx, { parentUserId: guardian.id, childUserId: child.id })
			await makeUserRelationship(tx, { ownerUserId: b.id, viewerUserId: a.id, accessLevel: 'none' })
			const id = await create(tx, admin.id, [guardian.id, child.id, a.id, b.id])
			const m = await memberOf(tx, id)
			await saveMemberRulesImpl({
				input: { exchangeId: id, memberId: m[a.id], blocks: [{ giverMemberId: m[a.id], recipientMemberId: m[guardian.id] }] },
				dbx: tx,
			})
			for (let i = 0; i < 5; i++) {
				await tx.update(giftExchanges).set({ drawnAt: null }).where(eq(giftExchanges.id, id))
				expect(await drawExchangeImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'ok' })
				const rows = await expectPerfectPairing(tx, id)
				const gives = Object.fromEntries(rows.map(r => [r.id, r.givesToMemberId]))
				expect(gives[m[child.id]]).not.toBe(m[guardian.id])
				expect(gives[m[a.id]]).not.toBe(m[b.id])
				expect(gives[m[a.id]]).not.toBe(m[guardian.id])
			}
		})
	})

	it('reports who is stuck when names cannot be drawn', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 3)
			const id = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			const m = await memberOf(tx, id)
			const [x, y, z] = users.map(u => m[u.id])
			await saveMemberRulesImpl({
				input: {
					exchangeId: id,
					memberId: x,
					blocks: [
						{ giverMemberId: x, recipientMemberId: y },
						{ giverMemberId: x, recipientMemberId: z },
					],
				},
				dbx: tx,
			})
			const res = await drawExchangeImpl({ exchangeId: id, dbx: tx })
			expect(res).toMatchObject({ kind: 'error', reason: 'no-valid-draw', problem: { reason: 'no-options', nobodyToGiftTo: [x] } })
		})
	})
})

describe('redrawExchangeImpl', () => {
	it('requires a draw', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 3)
			const id = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			expect(await redrawExchangeImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'error', reason: 'not-drawn' })
		})
	})

	it('with nobody having looked, replaces pairings and marks nobody changed, keeping readyEmailSentAt', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 4)
			const id = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			const sent = new Date('2026-11-01T00:00:00Z')
			await tx.update(giftExchangeMembers).set({ readyEmailSentAt: sent }).where(eq(giftExchangeMembers.exchangeId, id))
			expect(await redrawExchangeImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'ok' })
			const rows = await expectPerfectPairing(tx, id)
			for (const r of rows) {
				expect(r.changedAt).toBeNull()
				expect(r.seenAt).toBeNull()
				expect(r.readyEmailSentAt).toEqual(sent)
			}
		})
	})

	it('after someone looked, marks every member changed and clears seenAt', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 4)
			const id = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			const [first] = await members(tx, id)
			await setSeen(tx, first.id)
			expect(await redrawExchangeImpl({ exchangeId: id, dbx: tx })).toEqual({ kind: 'ok' })
			const rows = await expectPerfectPairing(tx, id)
			for (const r of rows) {
				expect(r.changedAt).not.toBeNull()
				expect(r.seenAt).toBeNull()
			}
		})
	})
})

// ===============================
// Rules
// ===============================

describe('saveMemberRulesImpl', () => {
	it('replaces the blocks involving one member before the draw, dropping locked pairs', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const guardian = await makeUser(tx)
			const child = await makeUser(tx, { role: 'child' })
			const other = await makeUser(tx)
			await makeGuardianship(tx, { parentUserId: guardian.id, childUserId: child.id })
			const id = await create(tx, admin.id, [guardian.id, child.id, other.id])
			const m = await memberOf(tx, id)
			const first = await saveMemberRulesImpl({
				input: {
					exchangeId: id,
					memberId: m[child.id],
					blocks: [
						{ giverMemberId: m[child.id], recipientMemberId: m[other.id] },
						// Locked (child to guardian): never stored.
						{ giverMemberId: m[child.id], recipientMemberId: m[guardian.id] },
					],
				},
				dbx: tx,
			})
			expect(first).toEqual({ kind: 'ok', redrew: false })
			let blocks = await tx.select().from(giftExchangeBlocks).where(eq(giftExchangeBlocks.exchangeId, id))
			expect(blocks).toHaveLength(1)
			expect(blocks[0]).toMatchObject({ giverMemberId: m[child.id], recipientMemberId: m[other.id] })

			await saveMemberRulesImpl({ input: { exchangeId: id, memberId: m[other.id], blocks: [] }, dbx: tx })
			blocks = await tx.select().from(giftExchangeBlocks).where(eq(giftExchangeBlocks.exchangeId, id))
			expect(blocks).toHaveLength(0)
		})
	})

	it('refuses a block that does not involve the member or names someone outside the exchange', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 3)
			const id = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			const otherId = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			const m = await memberOf(tx, id)
			const outsider = await memberOf(tx, otherId)
			const [a, b, c] = users.map(u => m[u.id])
			expect(
				await saveMemberRulesImpl({ input: { exchangeId: id, memberId: a, blocks: [{ giverMemberId: b, recipientMemberId: c }] }, dbx: tx })
			).toEqual({ kind: 'error', reason: 'invalid-block' })
			expect(
				await saveMemberRulesImpl({
					input: { exchangeId: id, memberId: a, blocks: [{ giverMemberId: a, recipientMemberId: outsider[users[1].id] }] },
					dbx: tx,
				})
			).toEqual({ kind: 'error', reason: 'invalid-block' })
			expect(await saveMemberRulesImpl({ input: { exchangeId: id, memberId: outsider[users[0].id], blocks: [] }, dbx: tx })).toEqual({
				kind: 'error',
				reason: 'not-found',
			})
		})
	})

	it('after the draw, requires confirmRedraw, refuses an impossible change, and otherwise redraws', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 4)
			const id = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			const m = await memberOf(tx, id)
			const [a, b, c, d] = users.map(u => m[u.id])

			const one = [{ giverMemberId: a, recipientMemberId: b }]
			expect(await saveMemberRulesImpl({ input: { exchangeId: id, memberId: a, blocks: one }, dbx: tx })).toEqual({
				kind: 'error',
				reason: 'confirm-redraw-required',
			})
			expect(await tx.select().from(giftExchangeBlocks).where(eq(giftExchangeBlocks.exchangeId, id))).toHaveLength(0)

			const impossible = [
				{ giverMemberId: a, recipientMemberId: b },
				{ giverMemberId: a, recipientMemberId: c },
				{ giverMemberId: a, recipientMemberId: d },
			]
			const refused = await saveMemberRulesImpl({
				input: { exchangeId: id, memberId: a, blocks: impossible, confirmRedraw: true },
				dbx: tx,
			})
			expect(refused).toMatchObject({ kind: 'error', reason: 'no-valid-draw' })
			// Rolled back: nothing saved.
			expect(await tx.select().from(giftExchangeBlocks).where(eq(giftExchangeBlocks.exchangeId, id))).toHaveLength(0)

			expect(await saveMemberRulesImpl({ input: { exchangeId: id, memberId: a, blocks: one, confirmRedraw: true }, dbx: tx })).toEqual({
				kind: 'ok',
				redrew: true,
			})
			const rows = await expectPerfectPairing(tx, id)
			expect(rows.find(r => r.id === a)!.givesToMemberId).not.toBe(b)
		})
	})
})

// ===============================
// Adding people
// ===============================

describe('addMembersImpl', () => {
	it('adds users before the draw, skipping members already in and refusing banned users', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const [a, b, c] = await makeUsers(tx, 3)
			const banned = await makeUser(tx, { banned: true })
			const id = await create(tx, admin.id, [a.id])
			expect(await addMembersImpl({ input: { exchangeId: id, userIds: [a.id, b.id, c.id] }, dbx: tx })).toEqual({ kind: 'ok', added: 2 })
			expect(await addMembersImpl({ input: { exchangeId: id, userIds: [banned.id] }, dbx: tx })).toEqual({
				kind: 'error',
				reason: 'user-banned',
			})
			expect(await members(tx, id)).toHaveLength(3)
		})
	})

	it('after the draw, fits a newcomer in and marks only the one person whose pairing changed', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 4)
			const id = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			const before = await members(tx, id)
			for (const r of before) await setSeen(tx, r.id)
			const newcomer = await makeUser(tx)

			expect(await addMembersImpl({ input: { exchangeId: id, userIds: [newcomer.id] }, dbx: tx })).toEqual({ kind: 'ok', added: 1 })
			const after = await expectPerfectPairing(tx, id)
			const z = after.find(r => r.userId === newcomer.id)!
			expect(z.readyEmailSentAt).toBeNull()
			const changed = after.filter(r => r.changedAt !== null)
			expect(changed).toHaveLength(1)
			expect(changed[0].givesToMemberId).toBe(z.id)
			expect(changed[0].seenAt).toBeNull()
			// Everyone else kept their pairing and their seenAt.
			const beforeById = new Map(before.map(r => [r.id, r.givesToMemberId]))
			for (const r of after) {
				if (r.id === z.id || r.id === changed[0].id) continue
				expect(r.givesToMemberId).toBe(beforeById.get(r.id))
				expect(r.seenAt).not.toBeNull()
			}
		})
	})

	it('after the draw, adds everybody in one call', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 3)
			const id = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			const more = await makeUsers(tx, 3)
			expect(await addMembersImpl({ input: { exchangeId: id, userIds: more.map(u => u.id) }, dbx: tx })).toEqual({ kind: 'ok', added: 3 })
			const rows = await expectPerfectPairing(tx, id)
			expect(rows).toHaveLength(6)
			// Newcomers are never marked changed.
			for (const row of rows.filter(r => more.some(u => u.id === r.userId))) expect(row.changedAt).toBeNull()
		})
	})

	it('after the draw, refuses and adds nothing when the newcomer cannot be fitted in', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 3)
			const newcomer = await makeUser(tx)
			// The newcomer set every member to none, so no member can gift to them.
			for (const u of users) await makeUserRelationship(tx, { ownerUserId: newcomer.id, viewerUserId: u.id, accessLevel: 'none' })
			const id = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			const res = await addMembersImpl({ input: { exchangeId: id, userIds: [newcomer.id] }, dbx: tx })
			expect(res).toEqual({ kind: 'error', reason: 'needs-redraw', userId: newcomer.id })
			expect(await members(tx, id)).toHaveLength(3)
			await expectPerfectPairing(tx, id)
		})
	})
})

// ===============================
// Removing people
// ===============================

describe('removeMemberImpl', () => {
	it('before the draw, deletes the member and their blocks', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 3)
			const id = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			const m = await memberOf(tx, id)
			await saveMemberRulesImpl({
				input: { exchangeId: id, memberId: m[users[0].id], blocks: [{ giverMemberId: m[users[0].id], recipientMemberId: m[users[1].id] }] },
				dbx: tx,
			})
			expect(await removeMemberImpl({ input: { exchangeId: id, memberId: m[users[0].id] }, dbx: tx })).toEqual({ kind: 'ok' })
			expect(await members(tx, id)).toHaveLength(2)
			expect(await tx.select().from(giftExchangeBlocks).where(eq(giftExchangeBlocks.exchangeId, id))).toHaveLength(0)
		})
	})

	it('after the draw, patches the giver onto the leaver recipient and touches nobody else', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 4)
			const id = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			const m = await memberOf(tx, id)
			const [a, p, b, c] = users.map(u => m[u.id])
			await forcePairing(tx, [
				[a, p],
				[p, b],
				[b, c],
				[c, a],
			])
			for (const id2 of [a, b, c]) await setSeen(tx, id2)

			expect(await removeMemberImpl({ input: { exchangeId: id, memberId: p }, dbx: tx })).toEqual({ kind: 'ok' })
			const rows = await expectPerfectPairing(tx, id)
			const byId = new Map(rows.map(r => [r.id, r]))
			expect(byId.get(a)).toMatchObject({ givesToMemberId: b, seenAt: null })
			expect(byId.get(a)!.changedAt).not.toBeNull()
			expect(byId.get(b)).toMatchObject({ givesToMemberId: c, changedAt: null })
			expect(byId.get(b)!.seenAt).not.toBeNull()
			expect(byId.get(c)).toMatchObject({ givesToMemberId: a, changedAt: null })
		})
	})

	it('after the draw, asks before a full redraw when the patch is not allowed, then removes and redraws', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 5)
			const id = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			const m = await memberOf(tx, id)
			const [a, p, b, c, d] = users.map(u => m[u.id])
			await forcePairing(tx, [
				[a, p],
				[p, b],
				[b, c],
				[c, d],
				[d, a],
			])
			// A may not gift to B, so the patch is out.
			await tx.insert(giftExchangeBlocks).values({ exchangeId: id, giverMemberId: a, recipientMemberId: b })
			await setSeen(tx, c)

			const asked = await removeMemberImpl({ input: { exchangeId: id, memberId: p }, dbx: tx })
			expect(asked).toEqual({ kind: 'needs-redraw', anyoneHasLooked: true })
			expect(await members(tx, id)).toHaveLength(5)

			expect(await removeMemberImpl({ input: { exchangeId: id, memberId: p, confirmRedraw: true }, dbx: tx })).toEqual({ kind: 'ok' })
			const rows = await expectPerfectPairing(tx, id)
			expect(rows).toHaveLength(4)
			expect(rows.find(r => r.id === a)!.givesToMemberId).not.toBe(b)
			// Someone had looked, so everyone is marked changed.
			for (const r of rows) expect(r.changedAt).not.toBeNull()
		})
	})

	it('after the draw, refuses with who is stuck when the rest cannot be drawn', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 4)
			const id = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			const m = await memberOf(tx, id)
			const [a, p, b, c] = users.map(u => m[u.id])
			await forcePairing(tx, [
				[a, p],
				[p, b],
				[b, c],
				[c, a],
			])
			// Once P is gone, A can gift to nobody.
			await tx.insert(giftExchangeBlocks).values([
				{ exchangeId: id, giverMemberId: a, recipientMemberId: b },
				{ exchangeId: id, giverMemberId: a, recipientMemberId: c },
			])
			const res = await removeMemberImpl({ input: { exchangeId: id, memberId: p, confirmRedraw: true }, dbx: tx })
			expect(res).toMatchObject({ kind: 'error', reason: 'no-valid-draw', problem: { reason: 'no-options', nobodyToGiftTo: [a] } })
			expect(await members(tx, id)).toHaveLength(4)
		})
	})

	it('refuses a member of another exchange', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 3)
			const id = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			const other = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			const m = await memberOf(tx, other)
			expect(await removeMemberImpl({ input: { exchangeId: id, memberId: m[users[0].id] }, dbx: tx })).toEqual({
				kind: 'error',
				reason: 'not-found',
			})
		})
	})
})

// ===============================
// Account deletion
// ===============================

describe('deleteUserAsAdminImpl and gift exchanges', () => {
	it('deleting a member of a drawn exchange leaves every remaining member with exactly one giver and one recipient', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 6)
			const id = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			const leaver = users[2]

			expect(await deleteUserAsAdminImpl({ db: tx, actor: { id: admin.id }, input: { userId: leaver.id } })).toEqual({ kind: 'ok' })
			const rows = await expectPerfectPairing(tx, id)
			expect(rows).toHaveLength(5)
			expect(rows.some(r => r.userId === null)).toBe(false)
		})
	})

	it('redraws without asking when the patch is not allowed', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 5)
			const id = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			const m = await memberOf(tx, id)
			const [a, p, b, c, d] = users.map(u => m[u.id])
			await forcePairing(tx, [
				[a, p],
				[p, b],
				[b, c],
				[c, d],
				[d, a],
			])
			await tx.insert(giftExchangeBlocks).values({ exchangeId: id, giverMemberId: a, recipientMemberId: b })
			await deleteUserAsAdminImpl({ db: tx, actor: { id: admin.id }, input: { userId: users[1].id } })
			const rows = await expectPerfectPairing(tx, id)
			expect(rows).toHaveLength(4)
			expect(rows.find(r => r.id === a)!.givesToMemberId).not.toBe(b)
		})
	})

	it('puts the exchange back to not drawn when no draw is possible', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 4)
			const id = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			const m = await memberOf(tx, id)
			const [a, p, b, c] = users.map(u => m[u.id])
			await forcePairing(tx, [
				[a, p],
				[p, b],
				[b, c],
				[c, a],
			])
			await tx.insert(giftExchangeBlocks).values([
				{ exchangeId: id, giverMemberId: a, recipientMemberId: b },
				{ exchangeId: id, giverMemberId: a, recipientMemberId: c },
			])
			await deleteUserAsAdminImpl({ db: tx, actor: { id: admin.id }, input: { userId: users[1].id } })
			expect((await exchangeRow(tx, id)).drawnAt).toBeNull()
			const rows = await members(tx, id)
			expect(rows).toHaveLength(3)
			for (const r of rows) expect(r.givesToMemberId).toBeNull()
		})
	})

	it('keeps the member row in an archived exchange as a deleted user', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 3)
			const id = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			await archiveExchangeImpl({ exchangeId: id, dbx: tx })
			await deleteUserAsAdminImpl({ db: tx, actor: { id: admin.id }, input: { userId: users[0].id } })
			const rows = await members(tx, id)
			expect(rows).toHaveLength(3)
			expect(rows.filter(r => r.userId === null)).toHaveLength(1)
			const read = await getExchangeForAdminImpl({ exchangeId: id, dbx: tx })
			expect(read.kind === 'ok' && read.exchange.pairings).toHaveLength(3)
		})
	})

	it('removes the member from a not-drawn exchange', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const users = await makeUsers(tx, 3)
			const id = await create(
				tx,
				admin.id,
				users.map(u => u.id)
			)
			await deleteUserAsAdminImpl({ db: tx, actor: { id: admin.id }, input: { userId: users[0].id } })
			const rows = await tx
				.select()
				.from(giftExchangeMembers)
				.where(and(eq(giftExchangeMembers.exchangeId, id)))
			expect(rows).toHaveLength(2)
		})
	})
})

// ===============================
// The exchange read
// ===============================

describe('getExchangeForAdminImpl', () => {
	it('returns members, rules, the draw check and the counts, and no pairings before archive', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const guardian = await makeUser(tx, { name: 'Gwen' })
			const child = await makeUser(tx, { name: 'Cal', role: 'child' })
			const other = await makeUser(tx, { name: 'Ora' })
			await makeGuardianship(tx, { parentUserId: guardian.id, childUserId: child.id })
			const id = await create(tx, admin.id, [guardian.id, child.id, other.id], 25)
			const m = await memberOf(tx, id)

			const before = await getExchangeForAdminImpl({ exchangeId: id, dbx: tx })
			if (before.kind !== 'ok') throw new Error('expected ok')
			expect(before.exchange).toMatchObject({
				state: 'not-drawn',
				budget: 25,
				budgetCurrency: 'USD',
				pairings: null,
				anyoneHasLooked: false,
			})
			expect(before.exchange.members.map(x => x.name)).toEqual(['Cal', 'Gwen', 'Ora'])
			expect(before.exchange.locked).toEqual([
				{ giverMemberId: m[child.id], recipientMemberId: m[guardian.id], reason: 'giver-is-child-of-recipient' },
			])
			expect(before.exchange.drawCheck).toEqual({ ok: true })
			expect(before.exchange.notEmailedCount).toBe(3)

			await drawExchangeImpl({ exchangeId: id, dbx: tx })
			await setSeen(tx, m[other.id])
			const after = await getExchangeForAdminImpl({ exchangeId: id, dbx: tx })
			if (after.kind !== 'ok') throw new Error('expected ok')
			expect(after.exchange).toMatchObject({ state: 'drawn', pairings: null, anyoneHasLooked: true })
		})
	})

	it('returns not-found for an unknown id', async () => {
		await withRollback(async tx => {
			expect(await getExchangeForAdminImpl({ exchangeId: '00000000-0000-4000-8000-000000000000', dbx: tx })).toEqual({
				kind: 'error',
				reason: 'not-found',
			})
		})
	})
})

describe('gift date', () => {
	const NOW = new Date('2026-11-24T12:00:00Z')

	it('refuses a new exchange dated in the past, and accepts one dated today', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const past = await createExchangeImpl({
				now: NOW,
				actorId: admin.id,
				input: { name: 'Yesterday', budget: null, giftDate: '2026-11-23', memberUserIds: [] },
				dbx: tx,
			})
			expect(past).toEqual({ kind: 'error', reason: 'gift-date-in-past' })

			const today = await createExchangeImpl({
				now: NOW,
				actorId: admin.id,
				input: { name: 'Today', budget: null, giftDate: '2026-11-24', memberUserIds: [] },
				dbx: tx,
			})
			expect(today.kind).toBe('ok')
		})
	})

	it('refuses moving the date into the past, but lets an exchange whose date has passed be renamed', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const created = await createExchangeImpl({
				now: NOW,
				actorId: admin.id,
				input: { name: 'Swap', budget: null, giftDate: '2026-11-25', memberUserIds: [] },
				dbx: tx,
			})
			if (created.kind !== 'ok') throw new Error('expected the exchange to be created')
			const later = new Date('2026-12-10T12:00:00Z')

			// The date has passed and is left alone: the rename goes through.
			const renamed = await updateExchangeImpl({
				now: later,
				input: { exchangeId: created.id, name: 'Swap, Late', budget: 20, giftDate: '2026-11-25' },
				dbx: tx,
			})
			expect(renamed).toEqual({ kind: 'ok' })

			// A different date that is also in the past is refused, and nothing changes.
			const moved = await updateExchangeImpl({
				now: later,
				input: { exchangeId: created.id, name: 'Swap, Moved', budget: 20, giftDate: '2026-12-01' },
				dbx: tx,
			})
			expect(moved).toEqual({ kind: 'error', reason: 'gift-date-in-past' })
			expect(await exchangeRow(tx, created.id)).toMatchObject({ name: 'Swap, Late', giftDate: '2026-11-25' })

			// A future date is fine.
			const future = await updateExchangeImpl({
				now: later,
				input: { exchangeId: created.id, name: 'Swap, Late', budget: 20, giftDate: '2026-12-20' },
				dbx: tx,
			})
			expect(future).toEqual({ kind: 'ok' })
		})
	})
})
