import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import pino from 'pino'

config()

// The migrate CLI is bundled standalone (see scripts/build-cli.mjs) and runs
// at container boot before the Nitro server starts. We use a plain pino logger
// (no transport worker) so the bundle stays self-contained and every startup
// produces a parseable JSON line the operator can grep.
const log = pino({
	level: process.env.LOG_LEVEL ?? 'info',
	base: { service: 'wish-lists', scope: 'migrate' },
	timestamp: pino.stdTimeFunctions.isoTime,
})

const url = process.env.DATABASE_URL
if (!url) {
	log.error('DATABASE_URL is not set; cannot run migrations')
	process.exit(1)
}

// Mask the password portion of DATABASE_URL for logging. Don't want credentials
// in logs but the host + db are useful for diagnosing "which DB did it hit."
const maskedUrl = (() => {
	try {
		const u = new URL(url)
		if (u.password) u.password = '***'
		return u.toString()
	} catch {
		return 'postgresql://***'
	}
})()

log.info({ databaseUrl: maskedUrl }, 'connecting to database')

const pool = new Pool({ connectionString: url })
const db = drizzle(pool)

const started = Date.now()
try {
	await migrate(db, { migrationsFolder: './drizzle' })
	log.info({ durationMs: Date.now() - started }, 'migrations applied')
} catch (err) {
	log.error({ err, durationMs: Date.now() - started }, 'migration failed')
	throw err
} finally {
	await pool.end()
}
