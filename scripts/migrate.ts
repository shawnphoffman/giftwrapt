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
	base: { service: 'giftwrapt', scope: 'migrate' },
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

// Pre-flight: detect the "push-poisoned DB" scenario that motivated the
// migration-history squash. Symptom in the field: app tables exist (because a
// prior operator ran `drizzle-kit push` against this volume) but
// __drizzle_migrations is empty/missing. drizzle-kit migrate then tries to run
// every migration from scratch and fails with 42P07 ("relation already
// exists") deep inside a transaction, with a 200-line stack trace that points
// at the table name but not at the actual cause. We abort early with a
// readable message so the operator can fix it without spelunking.
//
// The check stays cheap: one query for the tracker table, one row count, one
// for-any-app-table-exists. Skips entirely when the tracker is healthy.
async function preflight(): Promise<void> {
	const client = await pool.connect()
	try {
		const trackerExists = await client.query<{ exists: boolean }>(
			`SELECT EXISTS (
				SELECT 1 FROM information_schema.tables
				WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
			) AS "exists"`
		)
		const hasTracker = trackerExists.rows[0]?.exists === true
		const trackerRows = hasTracker
			? Number((await client.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM drizzle.__drizzle_migrations`)).rows[0]?.c ?? '0')
			: 0
		if (hasTracker && trackerRows > 0) return

		// Check for any well-known app table. If any exist, the DB has schema
		// state that didn't come from drizzle-kit migrate. Refuse.
		const sentinelTables = ['users', 'lists', 'items', 'app_settings', 'dependents']
		const appTables = await client.query<{ table_name: string }>(
			`SELECT table_name FROM information_schema.tables
			 WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
			[sentinelTables]
		)
		if (appTables.rows.length > 0) {
			log.fatal(
				{
					hasTracker,
					trackerRows,
					appTablesFound: appTables.rows.map(r => r.table_name),
				},
				'database has application tables but the drizzle migration tracker is empty or missing. ' +
					'This usually means the DB was provisioned via `drizzle-kit push` rather than migrations. ' +
					'Refusing to migrate (it would crash with "relation already exists"). ' +
					'Fix: drop and recreate the database, then restart this container so migrations run from scratch.'
			)
			process.exit(2)
		}
	} finally {
		client.release()
	}
}

const started = Date.now()
try {
	await preflight()
	await migrate(db, { migrationsFolder: './drizzle' })
	log.info({ durationMs: Date.now() - started }, 'migrations applied')
} catch (err) {
	log.error({ err, durationMs: Date.now() - started }, 'migration failed')
	throw err
} finally {
	await pool.end()
}
