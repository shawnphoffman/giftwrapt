// What the model sees. Every tool returns a short text block plus
// `structuredContent`, and some clients hand only the text to the model.
// These tests pin that the text of every read tool carries the ids a
// follow-up call needs, and that only the tools that read the open web
// say so in their annotations.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import {
	makeDependent,
	makeDependentGuardianship,
	makeGiftedItem,
	makeItem,
	makeItemComment,
	makeList,
	makeListAddon,
	makeUser,
} from '@test/integration/factories'
import { eq, inArray } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { appSettings, itemGroups, items, recommendations, users } from '@/db/schema'
import { createLogger } from '@/lib/logger'
import { getAppSettings } from '@/lib/settings-loader'

import type { McpActor, ToolContext } from '../context'
import { createMcpServer } from '../server'
import { errorCode, setMcpEnabled } from './helpers'

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

async function setSetting(key: string, value: unknown): Promise<void> {
	await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } })
}

function textOf(res: ToolResult): string {
	return res.content.map(c => (c.type === 'text' ? c.text : '')).join('\n')
}

// Keys whose values identify something a later tool call can take.
const ID_KEYS = new Set(['id', 'giftId', 'listId', 'primaryListId'])

type Skip = (path: string, node: Record<string, unknown>) => boolean

/** Every id in a structured result, except the ones `skip` says the text may leave out. */
function collectIds(value: unknown, skip: Skip, path = ''): Array<{ path: string; id: string | number }> {
	if (Array.isArray(value)) return value.flatMap((v, i) => collectIds(v, skip, `${path}[${i}]`))
	if (!value || typeof value !== 'object') return []
	const node = value as Record<string, unknown>
	if (skip(path, node)) return []
	const out: Array<{ path: string; id: string | number }> = []
	for (const [key, v] of Object.entries(node)) {
		const childPath = path ? `${path}.${key}` : key
		if (ID_KEYS.has(key) && (typeof v === 'string' || typeof v === 'number') && v !== '') out.push({ path: childPath, id: v })
		else out.push(...collectIds(v, skip, childPath))
	}
	return out
}

function textHasId(text: string, id: string | number): boolean {
	// Numeric ids are written `#12` or `id 12`; a bare substring match would
	// let "12" hide inside a price or a date.
	if (typeof id === 'number') return new RegExp(`(?:#|id )${id}(?!\\d)`, 'u').test(text)
	return text.includes(id)
}

// Ids the text deliberately leaves out, per tool, with the reason.
const SKIPS: Record<string, Skip> = {
	// Another gifter's claim or off-list gift cannot be changed by the user,
	// so its id is noise.
	get_wishlist: (path, node) => (/\.claims\[\d+\]$/u.test(path) || /^offListGifts\[\d+\]$/u.test(path)) && node.byMe === false,
	get_gift_context: (path, node) => (/\.claims\[\d+\]$/u.test(path) || /\.offListGifts\[\d+\]$/u.test(path)) && node.byMe === false,
	// The list id is what follow-up calls take; the person refs are labels.
	list_my_lists: path => /\.(?:forPerson|giftIdeasTarget)$/u.test(path),
	get_list: path => path === 'list.giftIdeasFor',
	// Recipients are named; list_people is where their ids come from.
	list_my_gifts: path => /\.recipient$/u.test(path) || path.startsWith('totals.byRecipient'),
	list_recommendations: path => /\.forDependent$/u.test(path),
	// Nothing takes a comment id or a revealed gift's id as input.
	list_comments: () => true,
	list_received_gifts: () => true,
}

// Read tools with no ids in their output; they also need the network.
const NO_IDS = new Set(['preview_url', 'lookup_barcode'])

const OPEN_WORLD = new Set(['add_item', 'add_items', 'preview_url', 'lookup_barcode'])

const createdUserIds: Array<string> = []

describe('MCP tool text and annotations', () => {
	beforeEach(async () => {
		await setMcpEnabled(true)
		await setSetting('enableComments', true)
		await setSetting('intelligenceEnabled', true)
	})
	afterEach(async () => {
		if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds.splice(0)))
		await setSetting('intelligenceEnabled', false)
		await setMcpEnabled(false)
	})

	it('only the tools that read the open web are marked open world', async () => {
		const me = await makeUser(db, { name: 'Annotated' })
		createdUserIds.push(me.id)
		const { client, close } = await connect(me.id)
		try {
			const { tools } = await client.listTools()
			for (const tool of tools) {
				expect(tool.annotations?.openWorldHint, tool.name).toBe(OPEN_WORLD.has(tool.name))
			}
			for (const name of OPEN_WORLD) expect(tools.map(t => t.name)).toContain(name)
		} finally {
			await close()
		}
	})

	it('a domain refusal is a readable tool error for a client that has listed the tools', async () => {
		// An SDK client validates `structuredContent` against the tool's
		// output schema once it knows the schema, even on error results. The
		// error must therefore not ride in `structuredContent`.
		const me = await makeUser(db, { name: 'Refused' })
		createdUserIds.push(me.id)
		const { client, close } = await connect(me.id)
		try {
			await client.listTools()
			const res = (await client.callTool({ name: 'get_list', arguments: { list_id: 999_999_999 } })) as ToolResult & {
				_meta?: Record<string, unknown>
			}
			expect(res.isError).toBe(true)
			expect(res.structuredContent).toBeUndefined()
			expect(textOf(res)).toMatch(/^Error \(/u)
			expect(errorCode(res)).toBeTruthy()
		} finally {
			await close()
		}
	})

	it('the text of every read tool carries the ids its structured result does', async () => {
		const me = await makeUser(db, { name: 'Reader', birthMonth: 'may', birthDay: 2 })
		const partner = await makeUser(db, { name: 'Partner' })
		const friend = await makeUser(db, { name: 'Friend', birthMonth: 'june', birthDay: 9 })
		const other = await makeUser(db, { name: 'Other Gifter' })
		createdUserIds.push(me.id, partner.id, friend.id, other.id)
		await db.update(users).set({ partnerId: partner.id }).where(eq(users.id, me.id))
		const dependent = await makeDependent(db, { name: 'Fido', createdByUserId: me.id })
		await makeDependentGuardianship(db, { guardianUserId: me.id, dependentId: dependent.id })

		// My own list, with a pick-one group.
		const mine = await makeList(db, { ownerId: me.id, name: 'My Wishes', isPrimary: true })
		const [myGroup] = await db.insert(itemGroups).values({ listId: mine.id, type: 'or', name: 'Either' }).returning()
		const kettle = await makeItem(db, { listId: mine.id, title: 'Kettle', url: 'https://example.com/kettle', notes: 'the red one' })
		await db.update(items).set({ groupId: myGroup.id }).where(eq(items.id, kettle.id))
		await makeItem(db, { listId: mine.id, title: 'Teapot' })

		// A friend's list: one item I claimed, one someone else claimed, an
		// in-order group, my off-list gift, and my private idea for them.
		const theirs = await makeList(db, { ownerId: friend.id, name: 'Friend Wishes', isPrimary: true })
		const [theirGroup] = await db.insert(itemGroups).values({ listId: theirs.id, type: 'order' }).returning()
		const scarf = await makeItem(db, { listId: theirs.id, title: 'Scarf', notes: 'size M' })
		const gloves = await makeItem(db, { listId: theirs.id, title: 'Gloves' })
		await db.update(items).set({ groupId: theirGroup.id }).where(eq(items.id, gloves.id))
		await makeGiftedItem(db, { itemId: scarf.id, gifterId: me.id, totalCost: '30' })
		await makeGiftedItem(db, { itemId: gloves.id, gifterId: other.id })
		await makeListAddon(db, { listId: theirs.id, userId: me.id, description: 'Chocolates' })
		await makeListAddon(db, { listId: theirs.id, userId: other.id, description: 'Flowers' })
		await makeItemComment(db, { itemId: scarf.id, userId: me.id, comment: 'Which colour?' })
		const ideas = await makeList(db, {
			ownerId: me.id,
			name: 'Ideas for Friend',
			type: 'giftideas',
			isPrivate: true,
			giftIdeasTargetUserId: friend.id,
		})
		await makeItem(db, { listId: ideas.id, title: 'Board Game' })

		await db.insert(recommendations).values({
			userId: me.id,
			batchId: crypto.randomUUID(),
			analyzerId: 'primary-list',
			kind: 'no-primary',
			fingerprint: 'fp-text',
			severity: 'suggest',
			title: 'A suggestion',
			body: 'Body.',
			payload: { actions: [] },
		})

		const cases: Record<string, Record<string, unknown>> = {
			get_me: {},
			list_my_lists: {},
			get_list: { list_id: mine.id },
			list_people: {},
			get_wishlist: { list_id: theirs.id },
			get_gift_context: { person_id: friend.id },
			list_my_gifts: {},
			search_my_items: { query: 'Kettle' },
			list_comments: { item_id: scarf.id },
			list_upcoming_occasions: { days: 366 },
			list_received_gifts: {},
			list_recommendations: {},
		}

		const { client, close } = await connect(me.id)
		try {
			// A new read tool has to be added to `cases` (or to NO_IDS with a reason).
			const { tools } = await client.listTools()
			const readTools = tools.filter(t => t.annotations?.readOnlyHint === true).map(t => t.name)
			expect(readTools.filter(n => !(n in cases) && !NO_IDS.has(n))).toEqual([])

			for (const [name, args] of Object.entries(cases)) {
				const res = (await client.callTool({ name, arguments: args })) as ToolResult
				expect(res.isError, name).toBeFalsy()
				const text = textOf(res)
				const ids = collectIds(res.structuredContent, SKIPS[name] ?? (() => false))
				for (const { path, id } of ids) {
					expect(textHasId(text, id), `${name}: ${path}=${id} missing from text:\n${text}`).toBe(true)
				}
			}

			// The cases above must have exercised real ids, not empty results.
			const wishlist = textOf((await client.callTool({ name: 'get_wishlist', arguments: { list_id: theirs.id } })) as ToolResult)
			expect(wishlist).toMatch(/you \(gift #\d+\)/u)
			expect(wishlist).toMatch(/#\d+ Chocolates \(you\)/u)
			expect(wishlist).not.toMatch(/#\d+ Flowers/u)
			expect(wishlist).toContain(`Group #${theirGroup.id} (buy in order)`)
			expect(wishlist).toContain('Notes: size M')

			const myList = textOf((await client.callTool({ name: 'get_list', arguments: { list_id: mine.id } })) as ToolResult)
			expect(myList).toContain(`Group #${myGroup.id} "Either" (pick one): #${kettle.id}`)
			expect(myList).toContain('https://example.com/kettle Notes: the red one')
			expect(myList).toMatch(/Teapot \[no link\]/u)
		} finally {
			await close()
		}
	})
})
