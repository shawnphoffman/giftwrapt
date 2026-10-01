// Tool behaviour through the SDK's in-memory transport: a real MCP
// `Client` talking to `createMcpServer` with no HTTP in between.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { makeGiftedItem, makeGuardianship, makeItem, makeList, makeUser } from '@test/integration/factories'
import { eq, inArray } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { users } from '@/db/schema'
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

async function callTool(client: Client, name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
	return (await client.callTool({ name, arguments: args })) as ToolResult
}

const createdUserIds: Array<string> = []

describe('MCP tools', () => {
	beforeEach(async () => {
		await setMcpEnabled(true)
	})
	afterEach(async () => {
		if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds.splice(0)))
		await setMcpEnabled(false)
	})

	it('get_me, list_my_lists, and get_list describe the owner view without claims', async () => {
		const me = await makeUser(db, { name: 'Owner', birthMonth: 'march', birthDay: 4 })
		const partner = await makeUser(db, { name: 'Partner' })
		const gifter = await makeUser(db, { name: 'Secret Santa' })
		createdUserIds.push(me.id, partner.id, gifter.id)
		await db.update(users).set({ partnerId: partner.id }).where(eq(users.id, me.id))
		const list = await makeList(db, { ownerId: me.id, name: 'Birthday Wishes', type: 'birthday', isPrimary: true })
		const item = await makeItem(db, { listId: list.id, title: 'Espresso Machine', price: '249.99', currency: 'USD', priority: 'high' })
		await makeItem(db, { listId: list.id, title: 'Socks' })
		await makeGiftedItem(db, { itemId: item.id, gifterId: gifter.id, totalCost: '240' })

		const { client, close } = await connect(me.id)
		try {
			const meResult = await callTool(client, 'get_me')
			expect(meResult.isError).toBeFalsy()
			const meData = meResult.structuredContent as {
				user: { name: string; birthday: string }
				partner: { name: string } | null
				primaryList: { id: number } | null
			}
			expect(meData.user.name).toBe('Owner')
			expect(meData.user.birthday).toBe('--03-04')
			expect(meData.partner?.name).toBe('Partner')
			expect(meData.primaryList?.id).toBe(list.id)

			const lists = await callTool(client, 'list_my_lists')
			const listsData = lists.structuredContent as { lists: Array<{ id: number; role: string; itemCount: number }> }
			expect(listsData.lists).toHaveLength(1)
			expect(listsData.lists[0]).toMatchObject({ id: list.id, role: 'owner', itemCount: 2 })

			const detail = await callTool(client, 'get_list', { list_id: list.id })
			expect(detail.isError).toBeFalsy()
			const detailData = detail.structuredContent as { items: Array<{ id: number; title: string; priceFormatted: string | null }> }
			expect(detailData.items.map(i => i.title).sort()).toEqual(['Espresso Machine', 'Socks'])
			expect(detailData.items.find(i => i.id === item.id)?.priceFormatted).toBe('$249.99')
			// Spoiler protection: nothing about the claim (who, how much, that
			// it exists) leaks into the owner view. The reveal schedule is
			// recipient-visible on the web too, so it is allowed.
			const serialized = JSON.stringify(detail)
			expect(serialized).not.toMatch(/Secret Santa|totalCost|gifterId|additionalGifterIds/u)
			expect(serialized).not.toContain(gifter.id)
		} finally {
			await close()
		}
	})

	it('get_list refuses a list the user cannot edit', async () => {
		const me = await makeUser(db, { name: 'Me' })
		const other = await makeUser(db, { name: 'Other' })
		createdUserIds.push(me.id, other.id)
		const theirs = await makeList(db, { ownerId: other.id, name: 'Theirs', type: 'wishlist' })
		const { client, close } = await connect(me.id)
		try {
			const res = await callTool(client, 'get_list', { list_id: theirs.id })
			expect(res.isError).toBe(true)
			expect((res.structuredContent as { error: { code: string } }).error.code).toBe('not-authorized')
			const missing = await callTool(client, 'get_list', { list_id: 999999 })
			expect((missing.structuredContent as { error: { code: string } }).error.code).toBe('not-found')
		} finally {
			await close()
		}
	})

	it('list_people returns visible people with lists, birthdays, and relationship flags', async () => {
		const me = await makeUser(db, { name: 'Me' })
		const friend = await makeUser(db, { name: 'Friend', birthMonth: 'december', birthDay: 25 })
		const child = await makeUser(db, { name: 'Kid', role: 'child' })
		createdUserIds.push(me.id, friend.id, child.id)
		await makeGuardianship(db, { parentUserId: me.id, childUserId: child.id })
		const friendList = await makeList(db, { ownerId: friend.id, name: 'Friend Wishes', type: 'wishlist', isPrimary: true })
		await makeItem(db, { listId: friendList.id, title: 'Book' })
		await makeList(db, { ownerId: child.id, name: 'Kid Wishes', type: 'wishlist' })

		const { client, close } = await connect(me.id)
		try {
			const res = await callTool(client, 'list_people')
			expect(res.isError).toBeFalsy()
			const data = res.structuredContent as {
				people: Array<{
					id: string
					name: string
					isChild: boolean
					canIEdit: boolean
					primaryListId: number | null
					daysUntilBirthday: number | null
					lists: Array<{ id: number; itemsRemaining: number }>
				}>
			}
			const f = data.people.find(p => p.id === friend.id)!
			expect(f.primaryListId).toBe(friendList.id)
			expect(f.lists[0].itemsRemaining).toBe(1)
			expect(typeof f.daysUntilBirthday).toBe('number')
			expect(f.isChild).toBe(false)
			const k = data.people.find(p => p.id === child.id)!
			expect(k.isChild).toBe(true)
			expect(k.canIEdit).toBe(true)
			expect(data.people.find(p => p.id === me.id)).toBeUndefined()

			const filtered = await callTool(client, 'list_people', { query: 'kid' })
			const filteredData = filtered.structuredContent as { people: Array<{ id: string }> }
			expect(filteredData.people.map(p => p.id)).toEqual([child.id])
		} finally {
			await close()
		}
	})
})
