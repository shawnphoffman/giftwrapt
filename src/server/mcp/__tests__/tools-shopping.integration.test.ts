// Gifter-side tools through the in-memory transport: the wishlist view
// with claims, claiming and updating, off-list gifts, gift ideas, the
// purchases summary, and comments.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { eq, inArray } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { appSettings, giftedItems, items, listAddons, users } from '@/db/schema'
import { createLogger } from '@/lib/logger'
import { getAppSettings } from '@/lib/settings-loader'

import type { McpActor, ToolContext } from '../context'
import { createMcpServer } from '../server'
import { setMcpEnabled } from './helpers'

type ToolResult = { isError?: boolean; content: Array<{ type: string; text?: string }>; structuredContent?: Record<string, unknown> }

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
	return (res.structuredContent as { error?: { code: string } } | undefined)?.error?.code
}

async function setComments(enabled: boolean): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key: 'enableComments', value: enabled })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: enabled } })
}

const createdUserIds: Array<string> = []

describe('MCP shopping tools', () => {
	beforeEach(async () => {
		await setMcpEnabled(true)
		await setComments(true)
	})
	afterEach(async () => {
		if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds.splice(0)))
		await setMcpEnabled(false)
	})

	it('get_wishlist shows claims and remaining; claim, update, split, unclaim round-trip', async () => {
		const me = await makeUser(db, { name: 'Shopper' })
		const friend = await makeUser(db, { name: 'Friend' })
		const other = await makeUser(db, { name: 'Other Gifter' })
		const coGifter = await makeUser(db, { name: 'Co Gifter' })
		createdUserIds.push(me.id, friend.id, other.id, coGifter.id)
		const list = await makeList(db, { ownerId: friend.id, name: 'Friend Wishes', type: 'wishlist', isPrimary: true })
		const twoWanted = await makeItem(db, { listId: list.id, title: 'Mugs', quantity: 2, price: '12', currency: 'USD' })
		const single = await makeItem(db, { listId: list.id, title: 'Scarf' })
		await makeGiftedItem(db, { itemId: twoWanted.id, gifterId: other.id, totalCost: '12', notes: 'secret note' })

		const { client, close } = await connect(me.id)
		try {
			const byPerson = await call(client, 'get_wishlist', { person_id: friend.id })
			expect(byPerson.isError).toBeFalsy()
			const data = byPerson.structuredContent as {
				list: { id: number; recipient: { id: string } }
				items: Array<{
					id: number
					remaining: number
					claims: Array<{ byMe: boolean; gifterNames: Array<string>; totalCost: string | null; notes: string | null }>
				}>
			}
			expect(data.list.id).toBe(list.id)
			expect(data.list.recipient.id).toBe(friend.id)
			const mugs = data.items.find(i => i.id === twoWanted.id)!
			expect(mugs.remaining).toBe(1)
			expect(mugs.claims).toHaveLength(1)
			expect(mugs.claims[0].byMe).toBe(false)
			expect(mugs.claims[0].gifterNames).toEqual(['Other Gifter'])
			// Another gifter's cost and notes stay private.
			expect(mugs.claims[0].totalCost).toBeNull()
			expect(mugs.claims[0].notes).toBeNull()
			expect(JSON.stringify(byPerson)).not.toContain('secret note')

			const claimed = await call(client, 'claim_item', {
				item_id: twoWanted.id,
				total_cost: '11.50',
				notes: 'blue ones',
				co_gifter_ids: [coGifter.id],
			})
			expect(claimed.isError).toBeFalsy()
			const gift = (claimed.structuredContent as { gift: { id: number; coGifterIds: Array<string> } }).gift
			expect(gift.coGifterIds).toEqual([coGifter.id])

			const again = await call(client, 'claim_item', { item_id: twoWanted.id })
			expect(code(again)).toBe('over-claim')

			const after = await call(client, 'get_wishlist', { list_id: list.id })
			const afterData = after.structuredContent as {
				items: Array<{ id: number; remaining: number; claims: Array<{ byMe: boolean; totalCost: string | null; notes: string | null }> }>
			}
			const mugsAfter = afterData.items.find(i => i.id === twoWanted.id)!
			expect(mugsAfter.remaining).toBe(0)
			const mine = mugsAfter.claims.find(c => c.byMe)!
			expect(Number(mine.totalCost)).toBe(11.5)
			expect(mine.notes).toBe('blue ones')

			const updated = await call(client, 'update_claim', { gift_id: gift.id, notes: 'blue, large', co_gifter_ids: [] })
			expect(updated.isError).toBeFalsy()
			expect((updated.structuredContent as { gift: { notes: string; coGifterIds: Array<string>; quantity: number } }).gift).toMatchObject({
				notes: 'blue, large',
				coGifterIds: [],
				quantity: 1,
			})

			const badSplit = await call(client, 'set_claim_split', { gift_id: gift.id, co_gifters: [{ user_id: other.id, amount: '5.00' }] })
			expect(code(badSplit)).toBe('invalid-gifter')

			const released = await call(client, 'unclaim_item', { gift_id: gift.id })
			expect(released.isError).toBeFalsy()
			expect(await db.query.giftedItems.findFirst({ where: eq(giftedItems.id, gift.id) })).toBeUndefined()

			const own = await makeList(db, { ownerId: me.id, name: 'Mine', type: 'wishlist' })
			const ownItem = await makeItem(db, { listId: own.id, title: 'My thing' })
			expect(code(await call(client, 'get_wishlist', { list_id: own.id }))).toBe('is-owner')
			expect(code(await call(client, 'claim_item', { item_id: ownItem.id }))).toBe('cannot-claim-own-list')
			expect(code(await call(client, 'claim_item', { item_id: single.id, quantity: 5 }))).toBe('over-claim')
		} finally {
			await close()
		}
	})

	it('off-list gifts, gift ideas, my gifts, and comments', async () => {
		const me = await makeUser(db, { name: 'Giver' })
		const friend = await makeUser(db, { name: 'Recipient' })
		createdUserIds.push(me.id, friend.id)
		const list = await makeList(db, { ownerId: friend.id, name: 'R Wishes', type: 'wishlist', isPrimary: true })
		const item = await makeItem(db, { listId: list.id, title: 'Camera', price: '300', currency: 'USD' })
		const ideas = await makeList(db, {
			ownerId: me.id,
			name: 'Ideas for R',
			type: 'giftideas',
			isPrivate: true,
			giftIdeasTargetUserId: friend.id,
		})
		const idea = await makeItem(db, { listId: ideas.id, title: 'Tripod', url: 'https://example.com/tripod' })

		const { client, close } = await connect(me.id)
		try {
			const wishlist = await call(client, 'get_wishlist', { list_id: list.id })
			const ideasOut = (wishlist.structuredContent as { myGiftIdeas: Array<{ listId: number; ideas: Array<{ id: number }> }> }).myGiftIdeas
			expect(ideasOut[0]?.listId).toBe(ideas.id)
			expect(ideasOut[0]?.ideas[0]?.id).toBe(idea.id)

			const addon = await call(client, 'add_off_list_gift', { list_id: list.id, description: 'Lens cloth', total_cost: '4.00' })
			expect(addon.isError).toBeFalsy()
			const addonId = (addon.structuredContent as { gift: { id: number } }).gift.id
			const edited = await call(client, 'update_off_list_gift', { addon_id: addonId, notes: 'microfiber' })
			expect((edited.structuredContent as { gift: { notes: string } }).gift.notes).toBe('microfiber')

			const used = await call(client, 'use_gift_idea', { idea_item_id: idea.id, list_id: list.id, total_cost: '25.00' })
			expect(used.isError).toBeFalsy()
			expect((used.structuredContent as { gift: { description: string; url: string | null } }).gift).toMatchObject({
				description: 'Tripod',
				url: 'https://example.com/tripod',
			})
			expect(await db.query.items.findFirst({ where: eq(items.id, idea.id) })).toBeUndefined()

			await call(client, 'claim_item', { item_id: item.id, total_cost: '300' })
			const mine = await call(client, 'list_my_gifts')
			const mineData = mine.structuredContent as {
				gifts: Array<{ kind: string; title: string }>
				totals: { count: number; cost: number; byRecipient: Array<{ id: string; cost: number }> }
			}
			expect(mineData.totals.count).toBe(3)
			expect(mineData.totals.cost).toBe(329)
			expect(mineData.totals.byRecipient[0]).toMatchObject({ id: friend.id, cost: 329 })
			const filtered = await call(client, 'list_my_gifts', { recipient_id: 'nobody' })
			expect((filtered.structuredContent as { totals: { count: number } }).totals.count).toBe(0)

			const deletedAddon = await call(client, 'delete_off_list_gift', { addon_id: addonId })
			expect(deletedAddon.isError).toBeFalsy()
			expect(await db.query.listAddons.findFirst({ where: eq(listAddons.id, addonId) })).toBeUndefined()

			const posted = await call(client, 'add_comment', { item_id: item.id, comment: 'Which colour?' })
			expect(posted.isError).toBeFalsy()
			const listed = await call(client, 'list_comments', { item_id: item.id })
			expect((listed.structuredContent as { comments: Array<{ comment: string }> }).comments.map(c => c.comment)).toEqual(['Which colour?'])

			await setComments(false)
			const { client: client2, close: close2 } = await connect(me.id)
			try {
				expect(code(await call(client2, 'list_comments', { item_id: item.id }))).toBe('feature-disabled')
				expect(code(await call(client2, 'add_comment', { item_id: item.id, comment: 'x' }))).toBe('feature-disabled')
			} finally {
				await close2()
				await setComments(true)
			}
		} finally {
			await close()
		}
	})
})
