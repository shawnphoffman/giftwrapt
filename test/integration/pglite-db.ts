import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'

import * as schema from '@/db/schema'

const here = path.dirname(fileURLToPath(import.meta.url))
const migrationsFolder = path.resolve(here, '../../drizzle')

const pg = new PGlite()
export const testDb = drizzle(pg, { schema })

// Per-worker init: opens pglite, applies the drizzle migration folder once
// per worker process. Tests must `await ready` before issuing queries.
export const ready: Promise<void> = (async () => {
	await pg.waitReady
	await migrate(testDb, { migrationsFolder })
})()

export type TestDb = typeof testDb
