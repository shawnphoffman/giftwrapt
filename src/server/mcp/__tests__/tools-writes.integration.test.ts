// Owner-side write tools through the in-memory transport: list CRUD,
// items, groups, search. Scrape-backed paths are exercised only for
// their input validation (no network in the harness).

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { eq, inArray } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { appSettings, giftedItems, items, users } from '@/db/schema'
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

const createdUserIds: Array<string> = []

async function setImportEnabled(enabled: boolean): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key: 'importEnabled', value: enabled })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: enabled } })
}

describe('MCP write tools', () => {
	beforeEach(async () => {
		await setMcpEnabled(true)
	})
	afterEach(async () => {
		if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds.splice(0)))
		await setMcpEnabled(false)
	})

	it('creates, updates, and deletes lists and items on the owner side', async () => {
		const me = await makeUser(db, { name: 'Writer' })
		createdUserIds.push(me.id)
		const { client, close } = await connect(me.id)
		try {
			const noPrimary = await call(client, 'add_item', { title: 'Orphan' })
			expect(code(noPrimary)).toBe('no-primary-list')

			const created = await call(client, 'create_list', { name: 'My Wishes', type: 'wishlist' })
			expect(created.isError).toBeFalsy()
			const listId = (created.structuredContent as { list: { id: number } }).list.id

			const primary = await call(client, 'set_primary_list', { list_id: listId })
			expect(primary.isError).toBeFalsy()

			const added = await call(client, 'add_item', { title: 'Headphones', price: '199', currency: 'USD', priority: 'high' })
			expect(added.isError).toBeFalsy()
			const item = (added.structuredContent as { item: { id: number; listId: number; priceFormatted: string }; enriched: boolean }).item
			expect(item.listId).toBe(listId)
			expect(item.priceFormatted).toBe('$199.00')
			expect((added.structuredContent as { enriched: boolean }).enriched).toBe(false)

			const badUrl = await call(client, 'add_item', { url: 'not a url' })
			expect(code(badUrl)).toBe('invalid-url')
			const noUrlNoTitle = await call(client, 'add_item', {})
			expect(code(noUrlNoTitle)).toBe('invalid-input')

			const updated = await call(client, 'update_item', { item_id: item.id, title: 'Noise-cancelling headphones', notes: 'Black' })
			expect((updated.structuredContent as { item: { title: string; notes: string } }).item.title).toBe('Noise-cancelling headphones')

			const found = await call(client, 'search_my_items', { query: 'headphones' })
			expect((found.structuredContent as { totalMatches: number }).totalMatches).toBe(1)
			const tooShort = await call(client, 'search_my_items', { query: 'a' })
			expect(code(tooShort)).toBe('query-too-short')

			const renamed = await call(client, 'update_list', { list_id: listId, name: 'Wishes 2026', description: 'Updated' })
			expect(renamed.isError).toBeFalsy()

			const deletedItem = await call(client, 'delete_item', { item_id: item.id })
			expect(deletedItem.isError).toBeFalsy()
			const gone = await db.query.items.findFirst({ where: eq(items.id, item.id) })
			expect(gone).toBeUndefined()

			const deletedList = await call(client, 'delete_list', { list_id: listId })
			expect((deletedList.structuredContent as { action: string }).action).toBe('deleted')
		} finally {
			await close()
		}
	})

	it('add_items bulk-creates when import is enabled and refuses when it is off', async () => {
		const me = await makeUser(db, { name: 'Bulk' })
		createdUserIds.push(me.id)
		const list = await makeList(db, { ownerId: me.id, name: 'Bulk', type: 'wishlist', isPrimary: true })
		const { client, close } = await connect(me.id)
		try {
			await setImportEnabled(false)
			const refused = await call(client, 'add_items', { items: [{ title: 'A' }] })
			expect(code(refused)).toBe('feature-disabled')

			await setImportEnabled(true)
			const res = await call(client, 'add_items', { items: [{ title: 'A' }, { title: 'B', price: '5' }] })
			expect(res.isError).toBeFalsy()
			const data = res.structuredContent as { items: Array<{ listId: number }>; enqueued: number }
			expect(data.items).toHaveLength(2)
			expect(data.items.every(i => i.listId === list.id)).toBe(true)
		} finally {
			await setImportEnabled(false)
			await close()
		}
	})

	it('availability, archive, move, and groups respect the spoiler and group rules', async () => {
		const me = await makeUser(db, { name: 'Owner' })
		const gifter = await makeUser(db, { name: 'Gifter' })
		createdUserIds.push(me.id, gifter.id)
		const list = await makeList(db, { ownerId: me.id, name: 'Main', type: 'wishlist', isPrimary: true })
		const other = await makeList(db, { ownerId: me.id, name: 'Other', type: 'wishlist' })
		const claimed = await makeItem(db, { listId: list.id, title: 'Claimed thing' })
		const free = await makeItem(db, { listId: list.id, title: 'Free thing' })
		const third = await makeItem(db, { listId: list.id, title: 'Third thing' })
		await makeGiftedItem(db, { itemId: claimed.id, gifterId: gifter.id })

		const { client, close } = await connect(me.id)
		try {
			// A claimed item cannot be marked unavailable, and the refusal is generic.
			const refused = await call(client, 'set_item_availability', { item_id: claimed.id, availability: 'unavailable' })
			expect(code(refused)).toBe('not-allowed')
			expect(JSON.stringify(refused)).not.toMatch(/claim|gifter/iu)
			const ok = await call(client, 'set_item_availability', { item_id: free.id, availability: 'unavailable' })
			expect((ok.structuredContent as { item: { availability: string } }).item.availability).toBe('unavailable')

			const group = await call(client, 'create_item_group', {
				list_id: list.id,
				type: 'or',
				name: 'Pick one',
				item_ids: [free.id, third.id],
			})
			expect(group.isError).toBeFalsy()
			const groupId = (group.structuredContent as { group: { id: number; itemIds: Array<number> } }).group.id
			const rows = await db
				.select({ id: items.id, groupId: items.groupId })
				.from(items)
				.where(inArray(items.id, [free.id, third.id]))
			expect(rows.every(r => r.groupId === groupId)).toBe(true)

			const renamedGroup = await call(client, 'update_item_group', { group_id: groupId, priority: 'high' })
			expect(renamedGroup.isError).toBeFalsy()
			const emptyUpdate = await call(client, 'update_item_group', { group_id: groupId })
			expect(code(emptyUpdate)).toBe('invalid-input')

			const ungrouped = await call(client, 'assign_items_to_group', { group_id: null, item_ids: [third.id] })
			expect(ungrouped.isError).toBeFalsy()
			const deletedGroup = await call(client, 'delete_item_group', { group_id: groupId })
			expect(deletedGroup.isError).toBeFalsy()

			const moved = await call(client, 'move_items', { item_ids: [third.id], target_list_id: other.id })
			expect((moved.structuredContent as { moved: number }).moved).toBe(1)

			const archived = await call(client, 'archive_items', { item_ids: [claimed.id] })
			expect((archived.structuredContent as { updated: number }).updated).toBe(1)
			const claimRows = await db.select({ id: giftedItems.id }).from(giftedItems).where(eq(giftedItems.itemId, claimed.id))
			expect(claimRows).toHaveLength(1)
		} finally {
			await close()
		}
	})

	it('refuses edits to lists the user cannot edit and validates scrape inputs', async () => {
		const me = await makeUser(db, { name: 'Me' })
		const other = await makeUser(db, { name: 'Other' })
		createdUserIds.push(me.id, other.id)
		const theirs = await makeList(db, { ownerId: other.id, name: 'Theirs', type: 'wishlist' })
		const theirItem = await makeItem(db, { listId: theirs.id, title: 'Not mine' })
		const { client, close } = await connect(me.id)
		try {
			expect(code(await call(client, 'add_item', { list_id: theirs.id, title: 'Sneaky' }))).toBe('not-authorized')
			expect(code(await call(client, 'update_item', { item_id: theirItem.id, title: 'Sneaky' }))).toBe('not-authorized')
			expect(code(await call(client, 'delete_item', { item_id: theirItem.id }))).toBe('not-authorized')
			expect(code(await call(client, 'update_list', { list_id: theirs.id, name: 'Sneaky' }))).toBe('not-authorized')
			expect(code(await call(client, 'delete_list', { list_id: theirs.id }))).toBe('not-owner')
			expect(code(await call(client, 'preview_url', { url: 'ftp://nope' }))).toBe('invalid-url')
			expect(code(await call(client, 'lookup_barcode', { code: '000000000000' }))).toBe('barcode-disabled')
		} finally {
			await close()
		}
	})
})
