// Occasions, received gifts, suggestions, dependents, resources, and
// prompts through the in-memory transport.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { eq, inArray } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { appSettings, lists, recommendations, users } from '@/db/schema'
import { createLogger } from '@/lib/logger'
import { getAppSettings } from '@/lib/settings-loader'

import type { McpActor, ToolContext } from '../context'
import { createMcpServer } from '../server'
import { setMcpEnabled } from './helpers'

type ToolResult = { isError?: boolean; content: Array<{ type: string; text?: string }>; structuredContent?: Record<string, unknown> }

async function connect(userId: string, isAdmin = false): Promise<{ client: Client; close: () => Promise<void> }> {
	const actor: McpActor = { userId, isAdmin, clientId: 'cid-test', tokenId: 'tok-test', scopes: ['openid'] }
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

async function setSetting(key: string, value: unknown): Promise<void> {
	await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } })
}

const createdUserIds: Array<string> = []

describe('MCP occasions, suggestions, dependents, resources, prompts', () => {
	beforeEach(async () => {
		await setMcpEnabled(true)
	})
	afterEach(async () => {
		if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds.splice(0)))
		await setSetting('intelligenceEnabled', false)
		await setMcpEnabled(false)
	})

	it('lists upcoming occasions with gift status and revealed gifts', async () => {
		const now = new Date()
		const inTenDays = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000)
		const monthNames = [
			'january',
			'february',
			'march',
			'april',
			'may',
			'june',
			'july',
			'august',
			'september',
			'october',
			'november',
			'december',
		] as const
		const me = await makeUser(db, { name: 'Me' })
		const friend = await makeUser(db, {
			name: 'Soon Birthday',
			birthMonth: monthNames[inTenDays.getUTCMonth()],
			birthDay: inTenDays.getUTCDate(),
		})
		const giver = await makeUser(db, { name: 'Generous' })
		createdUserIds.push(me.id, friend.id, giver.id)
		const friendList = await makeList(db, { ownerId: friend.id, name: 'FL', type: 'wishlist', isPrimary: true })
		const friendItem = await makeItem(db, { listId: friendList.id, title: 'Thing' })
		await makeGiftedItem(db, { itemId: friendItem.id, gifterId: me.id, totalCost: '10' })

		const mine = await makeList(db, { ownerId: me.id, name: 'Mine', type: 'wishlist' })
		const revealed = await makeItem(db, { listId: mine.id, title: 'Revealed gift', isArchived: true, archivedAt: now })
		await makeGiftedItem(db, { itemId: revealed.id, gifterId: giver.id })
		const hidden = await makeItem(db, { listId: mine.id, title: 'Still secret' })
		await makeGiftedItem(db, { itemId: hidden.id, gifterId: giver.id })

		const { client, close } = await connect(me.id)
		try {
			const res = await call(client, 'list_upcoming_occasions', { days: 30 })
			expect(res.isError).toBeFalsy()
			const data = res.structuredContent as {
				occasions: Array<{
					kind: string
					person: { id: string } | null
					daysUntil: number
					giftsAlreadyPlanned: number
					primaryListId: number | null
				}>
			}
			const bday = data.occasions.find(o => o.kind === 'birthday' && o.person?.id === friend.id)!
			expect(bday.daysUntil).toBeGreaterThanOrEqual(9)
			expect(bday.daysUntil).toBeLessThanOrEqual(11)
			expect(bday.giftsAlreadyPlanned).toBe(1)
			expect(bday.primaryListId).toBe(friendList.id)
			// Sorted soonest first.
			for (let i = 1; i < data.occasions.length; i++)
				expect(data.occasions[i].daysUntil).toBeGreaterThanOrEqual(data.occasions[i - 1].daysUntil)

			const received = await call(client, 'list_received_gifts')
			const gifts = (received.structuredContent as { gifts: Array<{ title: string; from: Array<string> }> }).gifts
			expect(gifts.map(g => g.title)).toEqual(['Revealed gift'])
			expect(gifts[0].from).toEqual(['Generous'])
			expect(JSON.stringify(received)).not.toContain('Still secret')
		} finally {
			await close()
		}
	})

	it('suggestions are gated, listable, applicable, and dismissable', async () => {
		const me = await makeUser(db, { name: 'Suggested' })
		createdUserIds.push(me.id)
		const list = await makeList(db, { ownerId: me.id, name: 'Only', type: 'wishlist' })

		const off = await connect(me.id)
		try {
			expect(code(await call(off.client, 'list_recommendations'))).toBe('feature-disabled')
		} finally {
			await off.close()
		}

		await setSetting('intelligenceEnabled', true)
		const [rec] = await db
			.insert(recommendations)
			.values({
				userId: me.id,
				batchId: crypto.randomUUID(),
				analyzerId: 'primary-list',
				kind: 'no-primary',
				fingerprint: 'fp-primary',
				severity: 'suggest',
				title: 'Pick a primary list',
				body: 'You have one list but no primary.',
				payload: {
					actions: [
						{
							label: 'Make it primary',
							description: 'Set "Only" as your primary list.',
							intent: 'do',
							apply: { kind: 'set-primary-list', listId: String(list.id) },
						},
						{ label: 'Open settings', description: 'Go look.', intent: 'noop', nav: { path: '/settings' } },
					],
				},
			})
			.returning({ id: recommendations.id })

		const { client, close } = await connect(me.id)
		try {
			const listed = await call(client, 'list_recommendations')
			expect(listed.isError).toBeFalsy()
			const recs = (
				listed.structuredContent as { recommendations: Array<{ id: string; actions: Array<{ index: number; canApply: boolean }> }> }
			).recommendations
			expect(recs.map(r => r.id)).toEqual([rec.id])
			expect(recs[0].actions.map(a => a.canApply)).toEqual([true, false])

			expect(code(await call(client, 'apply_recommendation', { recommendation_id: rec.id, action_index: 1 }))).toBe('invalid-input')
			const applied = await call(client, 'apply_recommendation', { recommendation_id: rec.id, action_index: 0 })
			expect(applied.isError).toBeFalsy()
			expect((applied.structuredContent as { kind: string }).kind).toBe('set-primary-list')
			const row = await db.query.lists.findFirst({ where: eq(lists.id, list.id), columns: { isPrimary: true } })
			expect(row?.isPrimary).toBe(true)

			const afterApply = await call(client, 'list_recommendations')
			expect((afterApply.structuredContent as { recommendations: Array<unknown> }).recommendations).toHaveLength(0)
			const withResolved = await call(client, 'list_recommendations', { include_resolved: true })
			expect((withResolved.structuredContent as { recommendations: Array<{ status: string }> }).recommendations[0].status).toBe('applied')

			// Dismiss / undo on a fresh active rec.
			const [rec2] = await db
				.insert(recommendations)
				.values({
					userId: me.id,
					batchId: crypto.randomUUID(),
					analyzerId: 'stale-items',
					kind: 'old',
					fingerprint: 'fp-stale',
					severity: 'info',
					title: 'Old stuff',
					body: 'Some items are old.',
					payload: { actions: [] },
				})
				.returning({ id: recommendations.id })
			expect((await call(client, 'dismiss_recommendation', { recommendation_id: rec2.id })).isError).toBeFalsy()
			expect(
				(await db.query.recommendations.findFirst({ where: eq(recommendations.id, rec2.id), columns: { status: true } }))?.status
			).toBe('dismissed')
			expect((await call(client, 'dismiss_recommendation', { recommendation_id: rec2.id, undo: true })).isError).toBeFalsy()
			expect(
				(await db.query.recommendations.findFirst({ where: eq(recommendations.id, rec2.id), columns: { status: true } }))?.status
			).toBe('active')
			expect(code(await call(client, 'dismiss_recommendation', { recommendation_id: crypto.randomUUID() }))).toBe('not-found')
		} finally {
			await close()
		}
	})

	it('dependent tools are admin-only, and resources plus prompts work', async () => {
		const me = await makeUser(db, { name: 'Plain' })
		const admin = await makeUser(db, { name: 'Admin', role: 'admin' })
		createdUserIds.push(me.id, admin.id)
		const mine = await makeList(db, { ownerId: me.id, name: 'Res List', type: 'wishlist', isPrimary: true })
		await makeItem(db, { listId: mine.id, title: 'Resource item' })

		const plain = await connect(me.id)
		try {
			expect(code(await call(plain.client, 'create_dependent', { name: 'Rex' }))).toBe('not-authorized')

			const resources = await plain.client.listResources()
			expect(resources.resources.map(r => r.uri)).toContain('giftwrapt://me')
			const meRes = await plain.client.readResource({ uri: 'giftwrapt://me' })
			const meJson = JSON.parse((meRes.contents[0] as { text: string }).text) as { user: { id: string } }
			expect(meJson.user.id).toBe(me.id)
			const listRes = await plain.client.readResource({ uri: `giftwrapt://lists/${mine.id}` })
			const listJson = JSON.parse((listRes.contents[0] as { text: string }).text) as { items: Array<{ title: string }> }
			expect(listJson.items.map(i => i.title)).toEqual(['Resource item'])
			await expect(plain.client.readResource({ uri: 'giftwrapt://lists/999999' })).rejects.toThrow(/not-found/u)

			const prompts = await plain.client.listPrompts()
			expect(prompts.prompts.map(p => p.name).sort()).toEqual(['plan_gifts_for', 'tidy_my_list', 'whats_coming_up'])
			const prompt = await plain.client.getPrompt({ name: 'plan_gifts_for', arguments: { person: 'Mom', budget: 'under 50' } })
			const text = (prompt.messages[0].content as { text: string }).text
			expect(text).toContain('Mom')
			expect(text).toContain('under 50')
			expect(text).toContain('get_wishlist')
		} finally {
			await plain.close()
		}

		const adminConn = await connect(admin.id, true)
		try {
			const created = await call(adminConn.client, 'create_dependent', { name: 'Rex', birth_month: 'may', birth_day: 4 })
			expect(created.isError).toBeFalsy()
			const dep = (created.structuredContent as { dependent: { id: string; birthday: string; guardianIds: Array<string> } }).dependent
			expect(dep.birthday).toBe('--05-04')
			expect(dep.guardianIds).toEqual([admin.id])
			const updated = await call(adminConn.client, 'update_dependent', { dependent_id: dep.id, name: 'Rex II' })
			expect((updated.structuredContent as { dependent: { name: string } }).dependent.name).toBe('Rex II')
			const meRes = await call(adminConn.client, 'get_me')
			expect((meRes.structuredContent as { dependents: Array<{ name: string }> }).dependents.map(d => d.name)).toEqual(['Rex II'])
		} finally {
			await adminConn.close()
		}
	})
})
