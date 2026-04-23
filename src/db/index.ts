import { config } from 'dotenv'
import type { Logger as DrizzleLogger } from 'drizzle-orm/logger'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { env } from '@/env'
import { createLogger } from '@/lib/logger'

import * as schema from './schema/index.ts'

config()

const dbLog = createLogger('db')

// Custom Drizzle logger — routes SQL queries through pino at debug level so
// LOG_LEVEL=debug (or trace) lights up the wire. At any other level Drizzle
// stays silent without us paying the formatting cost.
const drizzleLogger: DrizzleLogger = {
	logQuery(query, params) {
		dbLog.debug({ sql: query, params }, 'query')
	},
}

const pool = new Pool({
	connectionString: process.env.DATABASE_URL!,
})

pool.on('error', err => {
	dbLog.error({ err }, 'postgres pool error')
})

const debugSql = env.LOG_LEVEL === 'debug' || env.LOG_LEVEL === 'trace'

export const db = drizzle(pool, { schema, logger: debugSql ? drizzleLogger : false })
export type Database = typeof db
