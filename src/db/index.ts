import { config } from 'dotenv'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { Logger as DrizzleLogger } from 'drizzle-orm/logger'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { Pool } from 'pg'

import { env } from '@/env'
import { createLogger } from '@/lib/logger'

import * as schema from './schema/index.ts'

config()

const dbLog = createLogger('db')

// Custom Drizzle logger - routes SQL queries through pino at debug level so
// LOG_LEVEL=debug (or trace) lights up the wire. At any other level Drizzle
// stays silent without us paying the formatting cost.
const drizzleLogger: DrizzleLogger = {
	logQuery(query, params) {
		dbLog.debug({ sql: query, params }, 'query')
	},
}

// Pool tuning. `pg`'s defaults (`max: 10`, no `connectionTimeoutMillis`)
// translate to "exhaust quickly under bursty load, then wait forever for
// a free client" - which on serverless (Vercel) presents as a hung
// request rather than a clear error. Cap the wait at 5s so callers
// surface a real failure, and bump the ceiling to give multi-tab users
// some headroom. Long-running container deploys (Railway, Render,
// Coolify, NUC) get the same numbers without harm.
const pool = new Pool({
	connectionString: process.env.DATABASE_URL!,
	max: 20,
	idleTimeoutMillis: 30_000,
	connectionTimeoutMillis: 5_000,
})

pool.on('error', err => {
	dbLog.error({ err }, 'postgres pool error')
})

const debugSql = env.LOG_LEVEL === 'debug' || env.LOG_LEVEL === 'trace'

export const db = drizzle(pool, { schema, logger: debugSql ? drizzleLogger : false })
export type Database = typeof db

// Structural superset of `Database` and `PgliteDatabase<typeof schema>`. Use
// this in handler-impl signatures so production (`db`) and tests (`tx` from a
// pglite-backed drizzle) both satisfy the parameter without a cast.
export type SchemaDatabase = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>
