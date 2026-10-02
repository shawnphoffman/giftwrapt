// Concurrency tests for claimItemGiftImpl against a real Postgres server.
//
// The integration suite runs on a single PGlite connection inside a
// rolled-back transaction, so two claims can never actually contend there.
// These tests open a pool of real connections and fire claims at the same
// time, which is the only way to prove the row locks in claimItemGiftImpl
// hold the quantity invariant and the item-group gates.
//
// Local-only: `TEST_PG_URL=postgresql://postgres:password@localhost:54321/postgres pnpm test:pg`
// (the docker-compose postgres). The suite creates a throwaway database,
// migrates it, and drops it afterwards; it never touches existing databases.
// Run it after changing anything in the claim path.

import { makeItem, makeList, makeUser } from '@test/integration/factories'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { claimItemGiftImpl } from '@/api/_gifts-impl'
import type { SchemaDatabase } from '@/db'
import * as schema from '@/db/schema'
import { giftedItems, itemGroups, items } from '@/db/schema'

const ADMIN_URL = process.env.TEST_PG_URL
const ROUNDS = 15
const CONTENDERS = 12

let pool: Pool | null = null
let raceDb: SchemaDatabase
let dbName = ''

async function withAdmin(fn: (client: Client) => Promise<void>) {
	const client = new Client({ connectionString: ADMIN_URL })
	await client.connect()
	try {
		await fn(client)
	} finally {
		await client.end()
	}
}

async function makeGifters(count: number) {
	return Promise.all(Array.from({ length: count }, () => makeUser(raceDb)))
}

async function claimedQuantity(itemIds: Array<number>): Promise<number> {
	let total = 0
	for (const itemId of itemIds) {
		const rows = await raceDb.select({ quantity: giftedItems.quantity }).from(giftedItems).where(eq(giftedItems.itemId, itemId))
		total += rows.reduce((sum, r) => sum + r.quantity, 0)
	}
	return total
}

describe.skipIf(!ADMIN_URL)('claimItemGiftImpl under real concurrency', () => {
	beforeAll(async () => {
		dbName = `giftwrapt_race_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
		await withAdmin(c => c.query(`CREATE DATABASE "${dbName}"`).then(() => undefined))
		const url = new URL(ADMIN_URL!)
		url.pathname = `/${dbName}`
		pool = new Pool({ connectionString: url.toString(), max: CONTENDERS + 4 })
		raceDb = drizzle(pool, { schema }) as unknown as SchemaDatabase
		await migrate(drizzle(pool), { migrationsFolder: 'drizzle' })
	})

	afterAll(async () => {
		await pool?.end()
		if (dbName) await withAdmin(c => c.query(`DROP DATABASE IF EXISTS "${dbName}"`).then(() => undefined))
	})

	it('never over-claims a quantity-1 item', async () => {
		for (let round = 0; round < ROUNDS; round++) {
			const owner = await makeUser(raceDb)
			const list = await makeList(raceDb, { ownerId: owner.id })
			const item = await makeItem(raceDb, { listId: list.id, quantity: 1 })
			const gifters = await makeGifters(CONTENDERS)

			const results = await Promise.all(
				gifters.map(g => claimItemGiftImpl({ gifterId: g.id, input: { itemId: item.id, quantity: 1, totalCost: undefined }, dbx: raceDb }))
			)

			expect(results.filter(r => r.kind === 'ok')).toHaveLength(1)
			expect(await claimedQuantity([item.id])).toBe(1)
		}
	})

	it('fills a quantity-3 item exactly and rejects the rest', async () => {
		for (let round = 0; round < ROUNDS; round++) {
			const owner = await makeUser(raceDb)
			const list = await makeList(raceDb, { ownerId: owner.id })
			const item = await makeItem(raceDb, { listId: list.id, quantity: 3 })
			const gifters = await makeGifters(CONTENDERS)

			const results = await Promise.all(
				gifters.map(g => claimItemGiftImpl({ gifterId: g.id, input: { itemId: item.id, quantity: 1, totalCost: undefined }, dbx: raceDb }))
			)

			expect(results.filter(r => r.kind === 'ok')).toHaveLength(3)
			expect(await claimedQuantity([item.id])).toBe(3)
		}
	})

	it("allows only one claim across a 'pick one' group, even on different items", async () => {
		for (let round = 0; round < ROUNDS; round++) {
			const owner = await makeUser(raceDb)
			const list = await makeList(raceDb, { ownerId: owner.id })
			const [group] = await raceDb.insert(itemGroups).values({ listId: list.id, type: 'or' }).returning()
			const a = await makeItem(raceDb, { listId: list.id, quantity: 1 })
			const b = await makeItem(raceDb, { listId: list.id, quantity: 1 })
			await raceDb
				.update(items)
				.set({ groupId: group.id })
				.where(sql`${items.id} IN (${a.id}, ${b.id})`)
			const gifters = await makeGifters(CONTENDERS)

			const results = await Promise.all(
				gifters.map((g, i) =>
					claimItemGiftImpl({
						gifterId: g.id,
						input: { itemId: i % 2 === 0 ? a.id : b.id, quantity: 1, totalCost: undefined },
						dbx: raceDb,
					})
				)
			)

			expect(results.filter(r => r.kind === 'ok')).toHaveLength(1)
			expect(await claimedQuantity([a.id, b.id])).toBe(1)
		}
	})
})
