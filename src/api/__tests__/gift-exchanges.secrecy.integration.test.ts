// Secrecy (plan 39, "Secrecy, stated for logic.md"): no admin gift exchange
// function returns `givesToMemberId`, or anything derived from it, for an
// exchange that isn't archived. This calls every admin exchange function on
// a drawn exchange and searches each serialised result for a giver paired
// with their recipient.

import { makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'

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
	sendReadyEmailsImpl,
	updateExchangeImpl,
} from '@/api/_gift-exchanges-impl'
import type { SchemaDatabase } from '@/db'
import { appSettings, giftExchangeBlocks, giftExchangeMembers } from '@/db/schema'

// Send Emails runs for real against a stubbed mail transport.
vi.mock('@/lib/resend', () => ({
	isEmailConfigured: vi.fn(() => Promise.resolve(true)),
	sendGiftExchangeReadyEmail: vi.fn(() => Promise.resolve({ data: { id: 'x' }, error: null })),
	sendGiftExchangeChangedEmail: vi.fn(() => Promise.resolve({ data: { id: 'x' }, error: null })),
}))

async function pairings(tx: SchemaDatabase, exchangeId: string): Promise<Array<[string, string]>> {
	const rows = await tx
		.select({ giver: giftExchangeMembers.id, recipient: giftExchangeMembers.givesToMemberId })
		.from(giftExchangeMembers)
		.where(eq(giftExchangeMembers.exchangeId, exchangeId))
	return rows.filter(r => r.recipient !== null).map(r => [r.giver, r.recipient!])
}

// Fails when the result names a pairing: a `givesTo...` key anywhere, an
// object holding the giver and then their recipient as values, an object
// keyed by the giver whose value is the recipient, or the two ids next to
// each other in an array.
function expectNoPairing(label: string, result: unknown, pairs: Array<[string, string]>) {
	const json = JSON.stringify(result)
	expect(json, `${label}: givesTo key`).not.toMatch(/givesTo/i)

	const visit = (node: unknown) => {
		if (Array.isArray(node)) {
			for (let i = 0; i + 1 < node.length; i++) {
				for (const [g, r] of pairs) {
					expect(node[i] === g && node[i + 1] === r, `${label}: adjacent pair in array`).toBe(false)
				}
			}
			node.forEach(visit)
			return
		}
		if (node && typeof node === 'object') {
			const entries = Object.entries(node as Record<string, unknown>)
			const values = entries.map(([, v]) => v).filter(v => typeof v === 'string')
			for (const [g, r] of pairs) {
				// Giver before recipient: a block or locked pair in the other
				// direction legitimately holds both ids.
				const gi = values.indexOf(g)
				const ri = values.indexOf(r)
				expect(gi !== -1 && ri !== -1 && gi < ri, `${label}: giver and recipient in one object ${JSON.stringify(node)}`).toBe(false)
				expect((node as Record<string, unknown>)[g] === r, `${label}: giver keyed to recipient`).toBe(false)
			}
			entries.forEach(([, v]) => visit(v))
		}
	}
	visit(JSON.parse(json))
}

describe('gift exchange admin secrecy', () => {
	it('no admin function returns a pairing of a drawn exchange that is not archived', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const people = []
			for (let i = 0; i < 6; i++) people.push(await makeUser(tx))
			const late = await makeUser(tx)

			// Last year's exchange with the same people, archived, so the reads
			// below also carry which exchange this one avoids repeating (plan 40).
			const lastYear = await createExchangeImpl({
				now: new Date('2026-11-01T12:00:00Z'),
				actorId: admin.id,
				input: { name: 'Last Year', budget: null, giftDate: '2026-11-02', memberUserIds: people.map(p => p.id) },
				dbx: tx,
			})
			if (lastYear.kind !== 'ok') throw new Error('create failed')
			await drawExchangeImpl({ exchangeId: lastYear.id, dbx: tx })
			await archiveExchangeImpl({ exchangeId: lastYear.id, dbx: tx })

			const created = await createExchangeImpl({
				now: new Date('2026-11-01T12:00:00Z'),
				actorId: admin.id,
				input: { name: 'Secret', budget: 30, giftDate: '2026-12-25', memberUserIds: people.map(p => p.id) },
				dbx: tx,
			})
			if (created.kind !== 'ok') throw new Error('create failed')
			const exchangeId = created.id
			await tx.insert(appSettings).values({ key: 'enableGiftExchangeEmails', value: true })

			const results: Array<[string, unknown]> = []
			const check = async () => {
				const pairs = await pairings(tx, exchangeId)
				expect(pairs.length).toBeGreaterThan(0)
				for (const [label, result] of results.splice(0)) expectNoPairing(label, result, pairs)
			}

			results.push(['draw', await drawExchangeImpl({ exchangeId, dbx: tx })])
			await check()
			results.push(['list', await listExchangesImpl({ dbx: tx })])
			const read = await getExchangeForAdminImpl({ exchangeId, dbx: tx })
			if (read.kind !== 'ok') throw new Error('expected ok')
			expect(read.exchange.avoidsRepeatsFrom).toEqual({ id: lastYear.id, name: 'Last Year' })
			results.push(['get', read])
			results.push([
				'update',
				await updateExchangeImpl({
					now: new Date('2026-11-01T12:00:00Z'),
					input: { exchangeId, name: 'Secret 2', budget: 40, giftDate: '2026-12-24' },
					dbx: tx,
				}),
			])
			results.push(['delete (refused)', await deleteExchangeImpl({ exchangeId, dbx: tx })])
			results.push(['send ready emails', await sendReadyEmailsImpl({ exchangeId, dbx: tx })])
			await check()

			results.push(['redraw', await redrawExchangeImpl({ exchangeId, dbx: tx })])
			await check()

			const members = await tx.select().from(giftExchangeMembers).where(eq(giftExchangeMembers.exchangeId, exchangeId))
			const [m0, m1] = members
			results.push(['save rules (unconfirmed)', await saveMemberRulesImpl({ input: { exchangeId, memberId: m0.id, blocks: [] }, dbx: tx })])
			results.push([
				'save rules',
				await saveMemberRulesImpl({
					input: { exchangeId, memberId: m0.id, blocks: [{ giverMemberId: m0.id, recipientMemberId: m1.id }], confirmRedraw: true },
					dbx: tx,
				}),
			])
			await check()

			results.push(['add', await addMembersImpl({ input: { exchangeId, userIds: [late.id] }, dbx: tx })])
			await check()

			// A removal that asks first (the giver may not take the leaver's recipient)...
			const pairs = await pairings(tx, exchangeId)
			const [leaverGiver, leaver] = pairs[0]
			const leaverRecipient = pairs.find(([g]) => g === leaver)![1]
			if (leaverGiver !== leaverRecipient) {
				await tx
					.insert(giftExchangeBlocks)
					.values({ exchangeId, giverMemberId: leaverGiver, recipientMemberId: leaverRecipient })
					.onConflictDoNothing()
			}
			results.push(['remove (asks)', await removeMemberImpl({ input: { exchangeId, memberId: leaver }, dbx: tx })])
			await check()
			results.push([
				'remove (confirmed)',
				await removeMemberImpl({ input: { exchangeId, memberId: leaver, confirmRedraw: true }, dbx: tx }),
			])
			await check()
			// ...and one that patches.
			const [, patchLeaver] = (await pairings(tx, exchangeId))[1]
			results.push(['remove (patch)', await removeMemberImpl({ input: { exchangeId, memberId: patchLeaver }, dbx: tx })])
			results.push(['get after removals', await getExchangeForAdminImpl({ exchangeId, dbx: tx })])
			await check()

			// Once archived, the read lists who gifted to whom.
			await archiveExchangeImpl({ exchangeId, dbx: tx })
			const archived = await getExchangeForAdminImpl({ exchangeId, dbx: tx })
			if (archived.kind !== 'ok') throw new Error('expected ok')
			const finalPairs = await pairings(tx, exchangeId)
			expect(archived.exchange.pairings).toHaveLength(finalPairs.length)
			expect(new Set(archived.exchange.pairings!.map(p => `${p.giverMemberId}>${p.recipientMemberId}`))).toEqual(
				new Set(finalPairs.map(([g, r]) => `${g}>${r}`))
			)
		})
	})
})
