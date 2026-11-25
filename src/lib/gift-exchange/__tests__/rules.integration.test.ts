import { makeGuardianship, makeUser, makeUserRelationship } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import type { SchemaDatabase } from '@/db'
import { giftExchangeBlocks, giftExchangeMembers, giftExchanges, users } from '@/db/schema'

import { checkDraw } from '../draw'
import { canGiftTo, findEarlierExchange, findLockedPairs, loadExchangeGiftRules } from '../rules'

// An exchange with one member per user. Returns the exchange id and a
// userId -> memberId lookup.
async function makeExchange(tx: SchemaDatabase, userIds: Array<string>) {
	const [exchange] = await tx.insert(giftExchanges).values({ name: 'Family', giftDate: '2026-12-24' }).returning()
	const members = await tx
		.insert(giftExchangeMembers)
		.values(userIds.map(userId => ({ exchangeId: exchange.id, userId })))
		.returning()
	const memberOf = Object.fromEntries(members.map(m => [m.userId!, m.id]))
	return { exchangeId: exchange.id, memberOf }
}

async function can(tx: SchemaDatabase, exchangeId: string, giverMemberId: string, recipientMemberId: string) {
	return canGiftTo({ exchangeId, giverMemberId, recipientMemberId }, tx)
}

describe('canGiftTo', () => {
	it('allows any pair with no relationship rows', async () => {
		await withRollback(async tx => {
			const a = await makeUser(tx)
			const b = await makeUser(tx)
			const { exchangeId, memberOf } = await makeExchange(tx, [a.id, b.id])
			expect(await can(tx, exchangeId, memberOf[a.id], memberOf[b.id])).toBe(true)
			expect(await can(tx, exchangeId, memberOf[b.id], memberOf[a.id])).toBe(true)
		})
	})

	it('never lets a member gift to themselves', async () => {
		await withRollback(async tx => {
			const a = await makeUser(tx)
			const { exchangeId, memberOf } = await makeExchange(tx, [a.id])
			expect(await can(tx, exchangeId, memberOf[a.id], memberOf[a.id])).toBe(false)
		})
	})

	it('blocks the giver the recipient set to none, and only in that direction', async () => {
		await withRollback(async tx => {
			const recipient = await makeUser(tx)
			const giver = await makeUser(tx)
			await makeUserRelationship(tx, { ownerUserId: recipient.id, viewerUserId: giver.id, accessLevel: 'none' })
			const { exchangeId, memberOf } = await makeExchange(tx, [recipient.id, giver.id])
			expect(await can(tx, exchangeId, memberOf[giver.id], memberOf[recipient.id])).toBe(false)
			// The recipient's own view of the giver is a separate row, so they still can.
			expect(await can(tx, exchangeId, memberOf[recipient.id], memberOf[giver.id])).toBe(true)
		})
	})

	it('blocks a guardian or partner the recipient set to none, which getViewerAccessLevel would not', async () => {
		await withRollback(async tx => {
			const child = await makeUser(tx, { role: 'child' })
			const guardian = await makeUser(tx)
			await makeGuardianship(tx, { parentUserId: guardian.id, childUserId: child.id })
			await makeUserRelationship(tx, { ownerUserId: child.id, viewerUserId: guardian.id, accessLevel: 'none' })
			const { exchangeId, memberOf } = await makeExchange(tx, [child.id, guardian.id])
			expect(await can(tx, exchangeId, memberOf[guardian.id], memberOf[child.id])).toBe(false)
		})
	})

	it('allows a restricted viewer to gift', async () => {
		await withRollback(async tx => {
			const recipient = await makeUser(tx)
			const giver = await makeUser(tx)
			await makeUserRelationship(tx, { ownerUserId: recipient.id, viewerUserId: giver.id, accessLevel: 'restricted' })
			const { exchangeId, memberOf } = await makeExchange(tx, [recipient.id, giver.id])
			expect(await can(tx, exchangeId, memberOf[giver.id], memberOf[recipient.id])).toBe(true)
		})
	})

	it('blocks a child gifting to their guardian and allows the guardian gifting to the child', async () => {
		await withRollback(async tx => {
			const guardian = await makeUser(tx)
			const child = await makeUser(tx, { role: 'child' })
			await makeGuardianship(tx, { parentUserId: guardian.id, childUserId: child.id })
			const { exchangeId, memberOf } = await makeExchange(tx, [guardian.id, child.id])
			expect(await can(tx, exchangeId, memberOf[child.id], memberOf[guardian.id])).toBe(false)
			expect(await can(tx, exchangeId, memberOf[guardian.id], memberOf[child.id])).toBe(true)
		})
	})

	it('honours an admin block in its direction only', async () => {
		await withRollback(async tx => {
			const a = await makeUser(tx)
			const b = await makeUser(tx)
			const { exchangeId, memberOf } = await makeExchange(tx, [a.id, b.id])
			await tx.insert(giftExchangeBlocks).values({ exchangeId, giverMemberId: memberOf[a.id], recipientMemberId: memberOf[b.id] })
			expect(await can(tx, exchangeId, memberOf[a.id], memberOf[b.id])).toBe(false)
			expect(await can(tx, exchangeId, memberOf[b.id], memberOf[a.id])).toBe(true)
		})
	})

	it('is false for a member of another exchange', async () => {
		await withRollback(async tx => {
			const a = await makeUser(tx)
			const b = await makeUser(tx)
			const first = await makeExchange(tx, [a.id])
			const second = await makeExchange(tx, [b.id])
			expect(await can(tx, first.exchangeId, first.memberOf[a.id], second.memberOf[b.id])).toBe(false)
		})
	})

	it('ignores relationship rows between people outside the pair', async () => {
		await withRollback(async tx => {
			const a = await makeUser(tx)
			const b = await makeUser(tx)
			const c = await makeUser(tx)
			await makeUserRelationship(tx, { ownerUserId: c.id, viewerUserId: a.id, accessLevel: 'none' })
			await makeGuardianship(tx, { parentUserId: c.id, childUserId: a.id })
			const { exchangeId, memberOf } = await makeExchange(tx, [a.id, b.id, c.id])
			expect(await can(tx, exchangeId, memberOf[a.id], memberOf[b.id])).toBe(true)
		})
	})
})

describe('findLockedPairs', () => {
	it('reports each fixed limit with its reason', async () => {
		await withRollback(async tx => {
			const guardian = await makeUser(tx)
			const child = await makeUser(tx, { role: 'child' })
			const dana = await makeUser(tx)
			const omar = await makeUser(tx)
			await makeGuardianship(tx, { parentUserId: guardian.id, childUserId: child.id })
			// Omar set Dana to none: Dana can't see Omar's lists.
			await makeUserRelationship(tx, { ownerUserId: omar.id, viewerUserId: dana.id, accessLevel: 'none' })
			await makeUserRelationship(tx, { ownerUserId: guardian.id, viewerUserId: dana.id, accessLevel: 'restricted' })
			const { memberOf } = await makeExchange(tx, [guardian.id, child.id, dana.id, omar.id])
			const members = Object.entries(memberOf).map(([userId, id]) => ({ id, userId }))

			const locked = await findLockedPairs(members, tx)
			const crossPairs = locked.filter(p => p.reason !== 'self')
			expect(crossPairs).toHaveLength(2)
			expect(crossPairs).toEqual(
				expect.arrayContaining([
					{ giverMemberId: memberOf[child.id], recipientMemberId: memberOf[guardian.id], reason: 'giver-is-child-of-recipient' },
					{ giverMemberId: memberOf[dana.id], recipientMemberId: memberOf[omar.id], reason: 'recipient-denies-giver' },
				])
			)
			expect(
				locked
					.filter(p => p.reason === 'self')
					.map(p => p.giverMemberId)
					.sort()
			).toEqual(Object.values(memberOf).sort())
		})
	})

	it('locks a member with no user only against themselves', async () => {
		await withRollback(async tx => {
			const a = await makeUser(tx)
			const locked = await findLockedPairs(
				[
					{ id: 'm-a', userId: a.id },
					{ id: 'm-gone', userId: null },
				],
				tx
			)
			expect(locked).toEqual([
				{ giverMemberId: 'm-a', recipientMemberId: 'm-a', reason: 'self' },
				{ giverMemberId: 'm-gone', recipientMemberId: 'm-gone', reason: 'self' },
			])
		})
	})
})

describe('loadExchangeGiftRules', () => {
	it('combines fixed limits and admin blocks into the relation the draw uses', async () => {
		await withRollback(async tx => {
			const guardian = await makeUser(tx)
			const child = await makeUser(tx, { role: 'child' })
			const c = await makeUser(tx)
			await makeGuardianship(tx, { parentUserId: guardian.id, childUserId: child.id })
			const { exchangeId, memberOf } = await makeExchange(tx, [guardian.id, child.id, c.id])
			await tx.insert(giftExchangeBlocks).values({ exchangeId, giverMemberId: memberOf[c.id], recipientMemberId: memberOf[child.id] })

			const rules = await loadExchangeGiftRules(exchangeId, tx)
			expect(rules.memberIds.sort()).toEqual(Object.values(memberOf).sort())
			expect(rules.blocked).toEqual([{ giverMemberId: memberOf[c.id], recipientMemberId: memberOf[child.id] }])
			expect([...rules.allowed.get(memberOf[child.id])!]).toEqual([memberOf[c.id]])
			expect([...rules.allowed.get(memberOf[c.id])!]).toEqual([memberOf[guardian.id]])
			expect([...rules.allowed.get(memberOf[guardian.id])!].sort()).toEqual([memberOf[child.id], memberOf[c.id]].sort())
			// child -> c -> guardian -> child is the only draw.
			expect(checkDraw(rules.memberIds, rules.allowed)).toEqual({ ok: true })
		})
	})
})

// Avoiding the pairs of an earlier exchange (plan 40).
describe('findEarlierExchange', () => {
	// An archived exchange where each listed giver gifted to the listed recipient.
	async function makeArchived(
		tx: SchemaDatabase,
		args: { name: string; giftDate: string; archivedAt?: Date | null; pairs: Array<[string, string]> }
	) {
		const userIds = [...new Set(args.pairs.flat())]
		const [exchange] = await tx
			.insert(giftExchanges)
			.values({
				name: args.name,
				giftDate: args.giftDate,
				drawnAt: new Date('2025-11-01T12:00:00Z'),
				archivedAt: args.archivedAt === undefined ? new Date('2026-01-05T12:00:00Z') : args.archivedAt,
			})
			.returning()
		const rows = await tx
			.insert(giftExchangeMembers)
			.values(userIds.map(userId => ({ exchangeId: exchange.id, userId })))
			.returning()
		const idOf = new Map(rows.map(r => [r.userId!, r.id]))
		for (const [giver, recipient] of args.pairs) {
			await tx
				.update(giftExchangeMembers)
				.set({ givesToMemberId: idOf.get(recipient)! })
				.where(eq(giftExchangeMembers.id, idOf.get(giver)!))
		}
		return exchange.id
	}

	async function load(tx: SchemaDatabase, exchangeId: string) {
		const rules = await loadExchangeGiftRules(exchangeId, tx)
		return { earlier: rules.earlier, avoid: new Set(rules.avoid.map(p => `${p.giverMemberId}>${p.recipientMemberId}`)) }
	}

	it('finds nothing when no exchange is archived', async () => {
		await withRollback(async tx => {
			const [a, b, c] = [await makeUser(tx), await makeUser(tx), await makeUser(tx)]
			// Drawn, with the same people, but still running.
			await makeArchived(tx, {
				name: 'Running',
				giftDate: '2025-12-25',
				archivedAt: null,
				pairs: [
					[a.id, b.id],
					[b.id, c.id],
					[c.id, a.id],
				],
			})
			const { exchangeId } = await makeExchange(tx, [a.id, b.id, c.id])
			expect(await load(tx, exchangeId)).toEqual({ earlier: null, avoid: new Set() })
		})
	})

	it('maps who had whom to this exchange, one direction each, leaving out anyone who is not in it', async () => {
		await withRollback(async tx => {
			const [a, b, c, gone] = [await makeUser(tx), await makeUser(tx), await makeUser(tx), await makeUser(tx)]
			const earlierId = await makeArchived(tx, {
				name: 'Christmas 2025',
				giftDate: '2025-12-25',
				pairs: [
					[a.id, b.id],
					[b.id, gone.id],
					[gone.id, c.id],
					[c.id, a.id],
				],
			})
			const { exchangeId, memberOf } = await makeExchange(tx, [a.id, b.id, c.id])
			expect(await load(tx, exchangeId)).toEqual({
				earlier: { id: earlierId, name: 'Christmas 2025' },
				avoid: new Set([`${memberOf[a.id]}>${memberOf[b.id]}`, `${memberOf[c.id]}>${memberOf[a.id]}`]),
			})
		})
	})

	it('picks the latest gift date, and the one archived last when dates match', async () => {
		await withRollback(async tx => {
			const [a, b, c] = [await makeUser(tx), await makeUser(tx), await makeUser(tx)]
			const loop: Array<[string, string]> = [
				[a.id, b.id],
				[b.id, c.id],
				[c.id, a.id],
			]
			const back: Array<[string, string]> = [
				[a.id, c.id],
				[c.id, b.id],
				[b.id, a.id],
			]
			await makeArchived(tx, { name: '2024', giftDate: '2024-12-25', archivedAt: new Date('2026-03-01T12:00:00Z'), pairs: back })
			await makeArchived(tx, { name: '2025 first', giftDate: '2025-12-25', archivedAt: new Date('2026-01-05T12:00:00Z'), pairs: back })
			const latest = await makeArchived(tx, {
				name: '2025 second',
				giftDate: '2025-12-25',
				archivedAt: new Date('2026-01-06T12:00:00Z'),
				pairs: loop,
			})
			const { exchangeId, memberOf } = await makeExchange(tx, [a.id, b.id, c.id])
			const found = await load(tx, exchangeId)
			expect(found.earlier).toEqual({ id: latest, name: '2025 second' })
			expect(found.avoid).toEqual(new Set(loop.map(([g, r]) => `${memberOf[g]}>${memberOf[r]}`)))
		})
	})

	it('skips an exchange that shares fewer than two people, however recent', async () => {
		await withRollback(async tx => {
			const [a, b, c] = [await makeUser(tx), await makeUser(tx), await makeUser(tx)]
			const [x, y] = [await makeUser(tx), await makeUser(tx)]
			const family = await makeArchived(tx, {
				name: 'Family 2024',
				giftDate: '2024-12-25',
				pairs: [
					[a.id, b.id],
					[b.id, c.id],
					[c.id, a.id],
				],
			})
			// The office exchange is newer but only a is in both.
			await makeArchived(tx, {
				name: 'Office 2025',
				giftDate: '2025-12-20',
				pairs: [
					[a.id, x.id],
					[x.id, y.id],
					[y.id, a.id],
				],
			})
			const { exchangeId } = await makeExchange(tx, [a.id, b.id, c.id])
			expect((await load(tx, exchangeId)).earlier).toEqual({ id: family, name: 'Family 2024' })
		})
	})

	it('never matches the row of a deleted account', async () => {
		await withRollback(async tx => {
			const [a, b, c] = [await makeUser(tx), await makeUser(tx), await makeUser(tx)]
			await makeArchived(tx, {
				name: 'Christmas 2025',
				giftDate: '2025-12-25',
				pairs: [
					[a.id, b.id],
					[b.id, c.id],
					[c.id, a.id],
				],
			})
			await tx.delete(users).where(eq(users.id, c.id))
			const d = await makeUser(tx)
			const { exchangeId, memberOf } = await makeExchange(tx, [a.id, b.id, d.id])
			const found = await load(tx, exchangeId)
			expect(found.avoid).toEqual(new Set([`${memberOf[a.id]}>${memberOf[b.id]}`]))
		})
	})

	it('needs two members with accounts before it looks at all', async () => {
		await withRollback(async tx => {
			const a = await makeUser(tx)
			const { exchangeId } = await makeExchange(tx, [a.id])
			const members = await tx.select().from(giftExchangeMembers).where(eq(giftExchangeMembers.exchangeId, exchangeId))
			expect(await findEarlierExchange(exchangeId, members, tx)).toEqual({ earlier: null, avoid: [] })
		})
	})
})
