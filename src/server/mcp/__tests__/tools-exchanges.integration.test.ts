// list_my_gift_exchanges (plan 39, slice 39e) through the SDK's in-memory
// transport: who the user drew, that calling it counts as looking, and that
// nobody else's pairing ever comes back.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { makeGuardianship, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { archiveExchangeImpl, createExchangeImpl, drawExchangeImpl } from '@/api/_gift-exchanges-impl'
import type { SchemaDatabase } from '@/db'
import type { User } from '@/db/schema'
import { giftExchangeMembers } from '@/db/schema'
import { createLogger } from '@/lib/logger'
import { getAppSettings } from '@/lib/settings-loader'

import type { McpActor, ToolContext } from '../context'
import { createMcpServer } from '../server'

type ToolResult = {
	isError?: boolean
	content: Array<{ type: string; text?: string }>
	structuredContent?: Record<string, unknown>
}

type ExchangeData = {
	exchanges: Array<{
		id: string
		name: string
		budget: { amount: number; currency: string } | null
		giftDate: string
		daysUntil: number
		recipient: { kind: 'user'; id: string; name: string | null }
	}>
	page: { total: number; returned: number; offset: number; truncated: boolean }
}

const TOOL = 'list_my_gift_exchanges'
// Fixed so daysUntil is deterministic (the deployment zone defaults to UTC).
const NOW = new Date('2026-11-24T15:00:00Z')

async function connect(
	tx: SchemaDatabase,
	userId: string,
	opts: { canWrite?: boolean } = {}
): Promise<{ client: Client; close: () => Promise<void> }> {
	const actor: McpActor = {
		userId,
		isAdmin: false,
		clientId: 'cid-test',
		tokenId: 'tok-test',
		scopes: ['profile'],
		...(opts.canWrite === undefined ? {} : { canWrite: opts.canWrite }),
	}
	const settings = await getAppSettings(tx)
	const ctx: ToolContext = { actor, settings, dbx: tx, log: createLogger('mcp-test'), now: NOW }
	const server = createMcpServer(ctx)
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
	await server.connect(serverTransport)
	const client = new Client({ name: 'test', version: '0' })
	await client.connect(clientTransport)
	return {
		client,
		close: async () => {
			await client.close()
			await server.close()
		},
	}
}

async function callTool(tx: SchemaDatabase, userId: string, opts: { canWrite?: boolean } = {}): Promise<ToolResult> {
	const { client, close } = await connect(tx, userId, opts)
	try {
		return (await client.callTool({ name: TOOL, arguments: {} })) as ToolResult
	} finally {
		await close()
	}
}

function textOf(res: ToolResult): string {
	return res.content.map(c => (c.type === 'text' ? c.text : '')).join('\n')
}

function dataOf(res: ToolResult): ExchangeData {
	return res.structuredContent as ExchangeData
}

async function makePeople(tx: SchemaDatabase, names: Array<string>, role: 'user' | 'child' = 'user'): Promise<Array<User>> {
	const out: Array<User> = []
	for (const name of names) out.push(await makeUser(tx, { name, role }))
	return out
}

async function createExchange(
	tx: SchemaDatabase,
	actorId: string,
	userIds: Array<string>,
	opts: { name?: string; budget?: number | null; giftDate?: string } = {}
): Promise<string> {
	const res = await createExchangeImpl({
		now: new Date('2026-11-01T12:00:00Z'),
		actorId,
		input: {
			name: opts.name ?? 'Family',
			budget: opts.budget === undefined ? 50 : opts.budget,
			giftDate: opts.giftDate ?? '2026-12-25',
			memberUserIds: userIds,
		},
		dbx: tx,
	})
	if (res.kind !== 'ok') throw new Error(`create failed: ${res.reason}`)
	return res.id
}

async function drawnExchange(
	tx: SchemaDatabase,
	actorId: string,
	userIds: Array<string>,
	opts: { name?: string; budget?: number | null; giftDate?: string } = {}
): Promise<string> {
	const id = await createExchange(tx, actorId, userIds, opts)
	const drawn = await drawExchangeImpl({ exchangeId: id, dbx: tx })
	if (drawn.kind !== 'ok') throw new Error(`draw failed: ${drawn.reason}`)
	return id
}

/** Forces a loop through the users in the order given, so tests know who has whom. */
async function forceLoop(tx: SchemaDatabase, exchangeId: string, userIds: Array<string>): Promise<void> {
	const rows = await tx.select().from(giftExchangeMembers).where(eq(giftExchangeMembers.exchangeId, exchangeId))
	const byUser = new Map(rows.map(r => [r.userId!, r.id]))
	for (let i = 0; i < userIds.length; i++) {
		const giver = byUser.get(userIds[i])!
		const recipient = byUser.get(userIds[(i + 1) % userIds.length])!
		await tx.update(giftExchangeMembers).set({ givesToMemberId: recipient }).where(eq(giftExchangeMembers.id, giver))
	}
}

async function memberFor(tx: SchemaDatabase, exchangeId: string, userId: string) {
	const [row] = await tx
		.select()
		.from(giftExchangeMembers)
		.where(and(eq(giftExchangeMembers.exchangeId, exchangeId), eq(giftExchangeMembers.userId, userId)))
	return row
}

// Everything identifying about a person that must not leak.
function traces(user: User): Array<string> {
	return [user.id, user.email, user.name!]
}

describe('list_my_gift_exchanges', () => {
	it('is a read-only, idempotent, non-destructive, closed-world tool', async () => {
		await withRollback(async tx => {
			const [me] = await makePeople(tx, ['Annotated'])
			const { client, close } = await connect(tx, me.id)
			try {
				const { tools } = await client.listTools()
				const tool = tools.find(t => t.name === TOOL)
				expect(tool?.title).toBe('My Gift Exchanges')
				expect(tool?.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false })
			} finally {
				await close()
			}
		})
	})

	it('returns the caller’s recipient and records that they looked', async () => {
		await withRollback(async tx => {
			const [admin, ann, bea, cal] = await makePeople(tx, ['Admin Person', 'Ann Archer', 'Bea Baker', 'Cal Carter'])
			const exchangeId = await drawnExchange(tx, admin.id, [ann.id, bea.id, cal.id], { name: 'Christmas 2026' })
			await forceLoop(tx, exchangeId, [ann.id, bea.id, cal.id])
			expect((await memberFor(tx, exchangeId, ann.id)).seenAt).toBeNull()

			const res = await callTool(tx, ann.id)
			expect(res.isError).toBeFalsy()
			const data = dataOf(res)
			expect(data.exchanges).toEqual([
				{
					id: exchangeId,
					name: 'Christmas 2026',
					budget: { amount: 50, currency: 'USD' },
					giftDate: '2026-12-25',
					daysUntil: 31,
					recipient: { kind: 'user', id: bea.id, name: 'Bea Baker' },
				},
			])
			expect(data.page).toEqual({ total: 1, returned: 1, offset: 0, truncated: false })
			expect(textOf(res)).toBe(
				`Christmas 2026 [exchange id ${exchangeId}]: gift date 2026-12-25 (in 31 days), budget $50.00. You give to Bea Baker [user id ${bea.id}].`
			)

			const member = await memberFor(tx, exchangeId, ann.id)
			expect(member.seenAt).toBeInstanceOf(Date)
			expect(member.changedAt).toBeNull()
			// Only the caller looked.
			expect((await memberFor(tx, exchangeId, bea.id)).seenAt).toBeNull()
			expect((await memberFor(tx, exchangeId, cal.id)).seenAt).toBeNull()
		})
	})

	it('a second call keeps the first look and returns the same person', async () => {
		await withRollback(async tx => {
			const [admin, ann, bea, cal] = await makePeople(tx, ['Admin', 'Ann', 'Bea', 'Cal'])
			const exchangeId = await drawnExchange(tx, admin.id, [ann.id, bea.id, cal.id])
			await forceLoop(tx, exchangeId, [ann.id, bea.id, cal.id])

			await callTool(tx, ann.id)
			const firstSeen = (await memberFor(tx, exchangeId, ann.id)).seenAt
			expect(firstSeen).toBeInstanceOf(Date)

			const again = await callTool(tx, ann.id)
			expect(dataOf(again).exchanges.map(x => x.recipient.id)).toEqual([bea.id])
			expect((await memberFor(tx, exchangeId, ann.id)).seenAt).toEqual(firstSeen)
		})
	})

	it('clears the changed state, like See Who You Have', async () => {
		await withRollback(async tx => {
			const [admin, ann, bea, cal] = await makePeople(tx, ['Admin', 'Ann', 'Bea', 'Cal'])
			const exchangeId = await drawnExchange(tx, admin.id, [ann.id, bea.id, cal.id])
			const member = await memberFor(tx, exchangeId, ann.id)
			await tx.update(giftExchangeMembers).set({ changedAt: new Date() }).where(eq(giftExchangeMembers.id, member.id))

			await callTool(tx, ann.id)
			expect((await memberFor(tx, exchangeId, ann.id)).changedAt).toBeNull()
		})
	})

	it('gives an empty list to someone in no exchange', async () => {
		await withRollback(async tx => {
			const [admin, ann, bea, cal, stranger] = await makePeople(tx, ['Admin', 'Ann', 'Bea', 'Cal', 'Stranger'])
			await drawnExchange(tx, admin.id, [ann.id, bea.id, cal.id])

			const res = await callTool(tx, stranger.id)
			expect(res.isError).toBeFalsy()
			expect(dataOf(res)).toEqual({ exchanges: [], page: { total: 0, returned: 0, offset: 0, truncated: false } })
			expect(textOf(res)).toBe('The user is not in any gift exchange with names drawn.')
			for (const person of [ann, bea, cal]) for (const t of traces(person)) expect(JSON.stringify(res)).not.toContain(t)
		})
	})

	it('leaves out archived and never-drawn exchanges, and does not mark them looked', async () => {
		await withRollback(async tx => {
			const [admin, ann, bea, cal] = await makePeople(tx, ['Admin', 'Ann', 'Bea', 'Cal'])
			const undrawn = await createExchange(tx, admin.id, [ann.id, bea.id, cal.id], { name: 'Undrawn' })
			const archived = await drawnExchange(tx, admin.id, [ann.id, bea.id, cal.id], { name: 'Archived' })
			const archive = await archiveExchangeImpl({ exchangeId: archived, dbx: tx })
			expect(archive.kind).toBe('ok')
			const open = await drawnExchange(tx, admin.id, [ann.id, bea.id, cal.id], { name: 'Open', budget: null, giftDate: '2026-12-01' })

			const res = await callTool(tx, ann.id)
			const data = dataOf(res)
			expect(data.exchanges.map(x => x.id)).toEqual([open])
			expect(data.exchanges[0].budget).toBeNull()
			expect(data.exchanges[0].daysUntil).toBe(7)
			expect(textOf(res)).not.toContain(undrawn)
			expect(textOf(res)).not.toContain(archived)
			expect(textOf(res)).not.toContain('budget')
			expect((await memberFor(tx, archived, ann.id)).seenAt).toBeNull()
			expect((await memberFor(tx, undrawn, ann.id)).seenAt).toBeNull()
		})
	})

	it('lists several exchanges soonest first, each with its own person', async () => {
		await withRollback(async tx => {
			const [admin, ann, bea, cal, dee] = await makePeople(tx, ['Admin', 'Ann', 'Bea', 'Cal', 'Dee'])
			const later = await drawnExchange(tx, admin.id, [ann.id, bea.id, cal.id], { name: 'Later', giftDate: '2026-12-25' })
			const sooner = await drawnExchange(tx, admin.id, [ann.id, cal.id, dee.id], { name: 'Sooner', giftDate: '2026-12-01' })
			await forceLoop(tx, later, [ann.id, bea.id, cal.id])
			await forceLoop(tx, sooner, [ann.id, dee.id, cal.id])

			const res = await callTool(tx, ann.id)
			expect(dataOf(res).exchanges.map(x => [x.id, x.recipient.id])).toEqual([
				[sooner, dee.id],
				[later, bea.id],
			])
			const text = textOf(res)
			expect(text.indexOf(sooner)).toBeLessThan(text.indexOf(later))
		})
	})

	it('never returns another member’s pairing, in the text or the structured result', async () => {
		await withRollback(async tx => {
			const [admin, ann, bea, cal, dee] = await makePeople(tx, ['Admin Person', 'Ann Archer', 'Bea Baker', 'Cal Carter', 'Dee Dixon'])
			const exchangeId = await drawnExchange(tx, admin.id, [ann.id, bea.id, cal.id, dee.id])
			// Ann gives to Bea; Bea to Cal; Cal to Dee; Dee to Ann.
			await forceLoop(tx, exchangeId, [ann.id, bea.id, cal.id, dee.id])
			// Others have looked too, so their pairings are live in the database.
			for (const other of [bea, cal, dee]) await callTool(tx, other.id)

			const res = await callTool(tx, ann.id)
			const serialised = JSON.stringify(res)
			expect(serialised).toContain(bea.id)
			// Cal and Dee are only reachable through other people's pairings
			// (including who gives to Ann), so nothing of theirs may appear.
			for (const other of [cal, dee]) for (const t of traces(other)) expect(serialised).not.toContain(t)
		})
	})

	it('never returns a child’s assignment to their guardian, and does not mark the child looked', async () => {
		await withRollback(async tx => {
			const [admin, guardian, kidFriend1, kidFriend2] = await makePeople(tx, ['Admin', 'Guardian Gail', 'Friend One', 'Friend Two'])
			const [child] = await makePeople(tx, ['Kid Kim'], 'child')
			await makeGuardianship(tx, { parentUserId: guardian.id, childUserId: child.id })
			const kidsExchange = await drawnExchange(tx, admin.id, [child.id, kidFriend1.id, kidFriend2.id], { name: 'Kids' })

			// A guardian in no exchange of their own gets nothing at all.
			const none = await callTool(tx, guardian.id)
			expect(dataOf(none).exchanges).toEqual([])
			for (const p of [child, kidFriend1, kidFriend2]) for (const t of traces(p)) expect(JSON.stringify(none)).not.toContain(t)
			expect(JSON.stringify(none)).not.toContain(kidsExchange)

			// In an exchange of their own, still only their own pairing.
			const [a, b] = await makePeople(tx, ['Adult A', 'Adult B'])
			const adults = await drawnExchange(tx, admin.id, [guardian.id, a.id, b.id], { name: 'Adults' })
			const own = await callTool(tx, guardian.id)
			expect(dataOf(own).exchanges.map(x => x.id)).toEqual([adults])
			const serialised = JSON.stringify(own)
			expect(serialised).not.toContain(kidsExchange)
			for (const p of [child, kidFriend1, kidFriend2]) for (const t of traces(p)) expect(serialised).not.toContain(t)

			expect((await memberFor(tx, kidsExchange, child.id)).seenAt).toBeNull()
		})
	})

	it('is listed and works on a read-only connection', async () => {
		await withRollback(async tx => {
			const [admin, ann, bea, cal] = await makePeople(tx, ['Admin', 'Ann', 'Bea', 'Cal'])
			const exchangeId = await drawnExchange(tx, admin.id, [ann.id, bea.id, cal.id])
			await forceLoop(tx, exchangeId, [ann.id, bea.id, cal.id])

			const { client, close } = await connect(tx, ann.id, { canWrite: false })
			try {
				const { tools } = await client.listTools()
				expect(tools.map(t => t.name)).toContain(TOOL)
				// A write tool is hidden, so this really is a read-only connection.
				expect(tools.map(t => t.name)).not.toContain('claim_item')
				const res = (await client.callTool({ name: TOOL, arguments: {} })) as ToolResult
				expect(res.isError).toBeFalsy()
				expect(dataOf(res).exchanges.map(x => x.recipient.id)).toEqual([bea.id])
			} finally {
				await close()
			}
			expect((await memberFor(tx, exchangeId, ann.id)).seenAt).toBeInstanceOf(Date)
		})
	})

	it('pages with limit and offset, and only marks the returned exchanges looked', async () => {
		await withRollback(async tx => {
			const [admin, ann, bea, cal] = await makePeople(tx, ['Admin', 'Ann', 'Bea', 'Cal'])
			const first = await drawnExchange(tx, admin.id, [ann.id, bea.id, cal.id], { name: 'First', giftDate: '2026-12-01' })
			const second = await drawnExchange(tx, admin.id, [ann.id, bea.id, cal.id], { name: 'Second', giftDate: '2026-12-25' })

			const { client, close } = await connect(tx, ann.id)
			try {
				const res = (await client.callTool({ name: TOOL, arguments: { limit: 1 } })) as ToolResult
				expect(dataOf(res).exchanges.map(x => x.id)).toEqual([first])
				expect(dataOf(res).page).toEqual({ total: 2, returned: 1, offset: 0, truncated: true })
				expect(textOf(res)).toContain('Call again with offset 1')
			} finally {
				await close()
			}
			expect((await memberFor(tx, first, ann.id)).seenAt).toBeInstanceOf(Date)
			expect((await memberFor(tx, second, ann.id)).seenAt).toBeNull()
		})
	})
})
