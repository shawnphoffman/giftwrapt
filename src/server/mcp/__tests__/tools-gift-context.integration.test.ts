// get_gift_context and the paging / detail arguments, through the SDK's
// in-memory transport.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { makeGiftedItem, makeItem, makeList, makeListAddon, makeUser, makeUserRelationship } from '@test/integration/factories'
import { eq, inArray } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { itemAiAnalysis, itemGroups, items, users } from '@/db/schema'
import { createLogger } from '@/lib/logger'
import { getAppSettings } from '@/lib/settings-loader'

import type { McpActor, ToolContext } from '../context'
import { createMcpServer } from '../server'
import { errorCode, setMcpEnabled } from './helpers'

type ToolResult = {
	isError?: boolean
	_meta?: Record<string, unknown>
	content: Array<{ type: string; text?: string }>
	structuredContent?: Record<string, unknown>
}

async function connect(userId: string): Promise<{ client: Client; close: () => Promise<void> }> {
	const actor: McpActor = { userId, isAdmin: false, clientId: 'cid-test', tokenId: 'tok-test', scopes: ['openid'] }
	const settings = await getAppSettings(db)
	const ctx: ToolContext = { actor, settings, dbx: db, log: createLogger('mcp-test'), now: new Date() }
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

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
	return (await client.callTool({ name, arguments: args })) as ToolResult
}

function code(res: ToolResult): string | undefined {
	return errorCode(res)
}

function text(res: ToolResult): string {
	return res.content.map(c => (c.type === 'text' ? c.text : '')).join('\n')
}

type ContextData = {
	person: { id: string; name: string; birthday: string | null; daysUntilBirthday: number | null }
	lists: Array<{
		list: { id: number; name: string }
		items: Array<{
			id: number
			title: string
			remaining: number
			notes: string | null
			imageUrl: string | null
			claims: Array<{ byMe: boolean; gifterNames: Array<string>; totalCost: string | null; notes: string | null }>
		}>
		page: { total: number; returned: number; truncated: boolean }
		groups: Array<{ id: number; type: string }>
		offListGifts: Array<{ description: string; byMe: boolean; totalCost: string | null }>
	}>
	myGiftIdeas: Array<{ listName: string; ideas: Array<{ title: string; source: string }> }>
	myPastGifts: Array<{ kind: string; title: string; cost: number | null }>
	spend: { giftCount: number; allTime: number; last12Months: number }
	interests: Array<{ category: string; count: number }>
}

const createdUserIds: Array<string> = []

describe('MCP get_gift_context', () => {
	beforeEach(async () => {
		await setMcpEnabled(true)
	})
	afterEach(async () => {
		if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds.splice(0)))
		await setMcpEnabled(false)
	})

	it('returns lists with claim state, my ideas, my past gifts, and interests in one call', async () => {
		const me = await makeUser(db, { name: 'Shopper' })
		const friend = await makeUser(db, { name: 'Friend', birthMonth: 'june', birthDay: 9 })
		const other = await makeUser(db, { name: 'Other Gifter' })
		createdUserIds.push(me.id, friend.id, other.id)

		const primary = await makeList(db, { ownerId: friend.id, name: 'Friend Wishes', isPrimary: true })
		const second = await makeList(db, { ownerId: friend.id, name: 'Friend Christmas', type: 'christmas' })
		const [group] = await db.insert(itemGroups).values({ listId: primary.id, type: 'or', name: 'Either' }).returning()
		const scarf = await makeItem(db, { listId: primary.id, title: 'Scarf', price: '30', currency: 'USD', notes: 'size M' })
		const gloves = await makeItem(db, { listId: primary.id, title: 'Gloves' })
		const hat = await makeItem(db, { listId: primary.id, title: 'Hat', quantity: 2 })
		await db.update(items).set({ groupId: group.id }).where(eq(items.id, hat.id))
		await makeItem(db, { listId: second.id, title: 'Puzzle' })
		await makeGiftedItem(db, { itemId: scarf.id, gifterId: me.id, totalCost: '28.50', notes: 'wrapped' })
		await makeGiftedItem(db, { itemId: gloves.id, gifterId: other.id, totalCost: '99', notes: 'secret note' })
		await makeListAddon(db, { listId: primary.id, userId: me.id, description: 'Chocolates', totalCost: '12' })
		await makeListAddon(db, { listId: primary.id, userId: other.id, description: 'Flowers', totalCost: '40' })
		const ideas = await makeList(db, {
			ownerId: me.id,
			name: 'Ideas for Friend',
			type: 'giftideas',
			isPrivate: true,
			giftIdeasTargetUserId: friend.id,
		})
		await makeItem(db, { listId: ideas.id, title: 'Board Game' })
		await db.insert(itemAiAnalysis).values([
			{ itemId: scarf.id, contentHash: 'a', analysisVersion: 1, category: 'clothing' },
			{ itemId: gloves.id, contentHash: 'b', analysisVersion: 1, category: 'clothing' },
			{ itemId: hat.id, contentHash: 'c', analysisVersion: 1, category: 'other' },
		])

		const { client, close } = await connect(me.id)
		try {
			const res = await call(client, 'get_gift_context', { person_id: friend.id })
			expect(res.isError).toBeFalsy()
			const data = res.structuredContent as unknown as ContextData

			expect(data.person).toMatchObject({ id: friend.id, name: 'Friend', birthday: '--06-09' })
			expect(data.person.daysUntilBirthday).not.toBeNull()

			// Both visible lists, primary first.
			expect(data.lists.map(l => l.list.name)).toEqual(['Friend Wishes', 'Friend Christmas'])
			const main = data.lists[0]
			expect(main.page).toMatchObject({ total: 3, returned: 3, truncated: false })
			expect(main.groups).toMatchObject([{ id: group.id, type: 'or' }])

			// My own claim carries my cost and notes; the other gifter's never do.
			const scarfOut = main.items.find(i => i.title === 'Scarf')
			expect(scarfOut?.remaining).toBe(0)
			expect(scarfOut?.claims).toMatchObject([{ byMe: true, totalCost: '28.5', notes: 'wrapped' }])
			const glovesOut = main.items.find(i => i.title === 'Gloves')
			expect(glovesOut?.claims).toMatchObject([{ byMe: false, gifterNames: ['Other Gifter'], totalCost: null, notes: null }])
			expect(main.items.find(i => i.title === 'Hat')?.remaining).toBe(2)
			const whole = JSON.stringify(data) + text(res)
			expect(whole).not.toContain('secret note')
			expect(whole).not.toContain('"99"')

			// Off-list gifts: mine with its cost, theirs without.
			expect(main.offListGifts).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ description: 'Chocolates', byMe: true, totalCost: '12' }),
					expect.objectContaining({ description: 'Flowers', byMe: false, totalCost: null }),
				])
			)

			// Ideas are a separate key, labelled as mine in both forms.
			expect(data.myGiftIdeas).toMatchObject([
				{ listName: 'Ideas for Friend', ideas: [{ title: 'Board Game', source: 'my-private-idea' }] },
			])
			expect(main.items.map(i => i.title)).not.toContain('Board Game')
			expect(text(res)).toMatch(/your own private gift ideas for Friend \(NOT on their list/u)

			// What I already gave: my claim and my off-list gift, with spend.
			expect(data.myPastGifts.map(g => g.title).sort()).toEqual(['Chocolates', 'Scarf'])
			expect(data.spend).toMatchObject({ giftCount: 2, allTime: 40.5, last12Months: 40.5 })

			// Interests come from stored facets; 'other' is left out.
			expect(data.interests).toEqual([{ category: 'clothing', count: 2 }])
		} finally {
			await close()
		}
	})

	it('refuses the user themselves and people they cannot see', async () => {
		const me = await makeUser(db, { name: 'Me' })
		const hidden = await makeUser(db, { name: 'Hidden' })
		createdUserIds.push(me.id, hidden.id)
		await makeList(db, { ownerId: hidden.id, name: 'Hidden Wishes', isPrimary: true })
		await makeUserRelationship(db, { ownerUserId: hidden.id, viewerUserId: me.id, accessLevel: 'none' })

		const { client, close } = await connect(me.id)
		try {
			expect(code(await call(client, 'get_gift_context', { person_id: me.id }))).toBe('is-owner')
			expect(code(await call(client, 'get_gift_context', { person_id: hidden.id }))).toBe('not-found')
			expect(code(await call(client, 'get_gift_context', { person_id: 'nobody' }))).toBe('not-found')
		} finally {
			await close()
		}
	})

	it('a restricted viewer gets the filtered view', async () => {
		const me = await makeUser(db, { name: 'Restricted' })
		const owner = await makeUser(db, { name: 'Owner' })
		const other = await makeUser(db, { name: 'Outsider' })
		createdUserIds.push(me.id, owner.id, other.id)
		const list = await makeList(db, { ownerId: owner.id, name: 'Owner Wishes', isPrimary: true })
		await makeItem(db, { listId: list.id, title: 'Open Item' })
		const taken = await makeItem(db, { listId: list.id, title: 'Taken By Outsider' })
		await makeGiftedItem(db, { itemId: taken.id, gifterId: other.id })
		await makeListAddon(db, { listId: list.id, userId: other.id, description: 'Outsider Addon' })
		await makeUserRelationship(db, { ownerUserId: owner.id, viewerUserId: me.id, accessLevel: 'restricted' })

		const { client, close } = await connect(me.id)
		try {
			const res = await call(client, 'get_gift_context', { person_id: owner.id })
			expect(res.isError).toBeFalsy()
			const data = res.structuredContent as unknown as ContextData
			expect(data.lists[0].items.map(i => i.title)).toEqual(['Open Item'])
			expect(data.lists[0].offListGifts).toEqual([])
			const whole = JSON.stringify(data) + text(res)
			expect(whole).not.toContain('Taken By Outsider')
			expect(whole).not.toContain('Outsider')
		} finally {
			await close()
		}
	})
})

describe('MCP bounded results', () => {
	beforeEach(async () => {
		await setMcpEnabled(true)
	})
	afterEach(async () => {
		if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds.splice(0)))
		await setMcpEnabled(false)
	})

	it('get_list and get_wishlist return a page and say when more remain', async () => {
		const me = await makeUser(db, { name: 'Pager' })
		const friend = await makeUser(db, { name: 'Long List' })
		createdUserIds.push(me.id, friend.id)
		const mine = await makeList(db, { ownerId: me.id, name: 'Mine', isPrimary: true })
		const theirs = await makeList(db, { ownerId: friend.id, name: 'Theirs', isPrimary: true })
		const rows = Array.from({ length: 120 }, (_, n) => ({
			title: `Thing ${n + 1}`,
			notes: 'n'.repeat(600),
			imageUrl: 'https://img.example/x.jpg',
		}))
		await db.insert(items).values(rows.map(r => ({ ...r, listId: mine.id })))
		await db.insert(items).values(rows.map(r => ({ ...r, listId: theirs.id })))

		const { client, close } = await connect(me.id)
		try {
			for (const [tool, args] of [
				['get_list', { list_id: mine.id }],
				['get_wishlist', { list_id: theirs.id }],
			] as const) {
				const first = await call(client, tool, args)
				const data = first.structuredContent as {
					items: Array<{ id: number; notes: string; imageUrl: string | null }>
					page: Record<string, unknown>
				}
				expect(data.page, tool).toEqual({ total: 120, returned: 100, offset: 0, truncated: true })
				expect(data.items, tool).toHaveLength(100)
				expect(text(first), tool).toContain('Showing 100 of 120 items (from 1). Call again with offset 100 for more.')
				// Summary detail by default: notes clipped, no image URLs.
				expect(data.items[0].notes.length, tool).toBeLessThanOrEqual(201)
				expect(data.items[0].imageUrl, tool).toBeNull()

				const rest = await call(client, tool, { ...args, offset: 100 })
				const restData = rest.structuredContent as { items: Array<{ id: number }>; page: Record<string, unknown> }
				expect(restData.page, tool).toEqual({ total: 120, returned: 20, offset: 100, truncated: false })
				const seen = new Set([...data.items, ...restData.items].map(i => i.id))
				expect(seen.size, tool).toBe(120)

				const full = await call(client, tool, { ...args, limit: 1, detail: 'full' })
				const fullData = full.structuredContent as { items: Array<{ notes: string; imageUrl: string | null }> }
				expect(fullData.items[0].notes, tool).toHaveLength(600)
				expect(fullData.items[0].imageUrl, tool).toBe('https://img.example/x.jpg')
			}

			// A 50-item summary stays small: the whole result, text and structured.
			const fifty = await call(client, 'get_wishlist', { list_id: theirs.id, limit: 50 })
			expect((text(fifty) + JSON.stringify(fifty.structuredContent)).length).toBeLessThan(50_000)

			// get_gift_context caps each list and points at get_wishlist for the rest.
			const context = await call(client, 'get_gift_context', { person_id: friend.id })
			const contextData = context.structuredContent as {
				lists: Array<{ items: Array<unknown>; page: { truncated: boolean; total: number } }>
			}
			expect(contextData.lists[0].items).toHaveLength(50)
			expect(contextData.lists[0].page).toMatchObject({ total: 120, truncated: true })
		} finally {
			await close()
		}
	})

	it('list_people and list_my_gifts page, and list_my_gifts totals cover everything', async () => {
		const me = await makeUser(db, { name: 'Giver' })
		const friend = await makeUser(db, { name: 'Recipient' })
		createdUserIds.push(me.id, friend.id)
		const theirs = await makeList(db, { ownerId: friend.id, name: 'Theirs', isPrimary: true })
		for (let n = 0; n < 5; n++) {
			const item = await makeItem(db, { listId: theirs.id, title: `Gift ${n}` })
			await makeGiftedItem(db, { itemId: item.id, gifterId: me.id, totalCost: '10' })
		}

		const { client, close } = await connect(me.id)
		try {
			const gifts = await call(client, 'list_my_gifts', { limit: 2 })
			const data = gifts.structuredContent as {
				gifts: Array<unknown>
				page: Record<string, unknown>
				totals: { count: number; cost: number }
			}
			expect(data.gifts).toHaveLength(2)
			expect(data.page).toEqual({ total: 5, returned: 2, offset: 0, truncated: true })
			expect(data.totals).toMatchObject({ count: 5, cost: 50 })
			expect(text(gifts)).toContain('Showing 2 of 5 gifts')

			const people = await call(client, 'list_people', { limit: 1 })
			const peopleData = people.structuredContent as { people: Array<unknown>; page: { returned: number } }
			expect(peopleData.people).toHaveLength(1)
			expect(peopleData.page.returned).toBe(1)
		} finally {
			await close()
		}
	})
})
