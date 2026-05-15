/**
 * Drops and recreates the database named in DATABASE_URL. Local/docker only.
 *
 * The previous `db:reset` shelled out to `drizzle-kit push --force`, which
 * applied the schema source directly to the running DB and left
 * `__drizzle_migrations` empty. That broke any subsequent `drizzle-kit migrate`
 * (the migrator saw an empty tracker, tried to re-create existing tables, and
 * crashed with 42P07). The two workflows are mutually exclusive; pick one.
 *
 * Reset now follows the migrate workflow end to end: drop the database,
 * recreate it empty, run migrations, seed. No push.
 *
 * Usage:
 *   pnpm db:reset
 *   (wraps `tsx --env-file=.env.local scripts/db-reset.ts && drizzle-kit migrate && pnpm db:seed`)
 */

import pg from 'pg'

function assertLocalDatabaseUrl(urlStr: string): string {
	let host: string
	try {
		host = new URL(urlStr).hostname
	} catch {
		throw new Error(`DATABASE_URL is not a valid URL: ${urlStr}`)
	}

	const safeHosts = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal', 'postgres', 'db'])
	if (!safeHosts.has(host)) {
		throw new Error(`Refusing to reset DB: DATABASE_URL host "${host}" is not in the local/docker allowlist.`)
	}
	return host
}

async function main() {
	const raw = process.env.DATABASE_URL
	if (!raw) throw new Error('DATABASE_URL is not set.')

	assertLocalDatabaseUrl(raw)

	const base = new URL(raw)
	const dbName = decodeURIComponent(base.pathname.replace(/^\//, '').split('/')[0])
	if (!dbName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) {
		throw new Error(`Invalid or unsupported Postgres database name "${dbName}" in DATABASE_URL.`)
	}

	base.pathname = '/postgres'
	const admin = new pg.Client({ connectionString: base.toString() })
	await admin.connect()
	try {
		await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [dbName])
		await admin.query(`DROP DATABASE IF EXISTS ${dbName}`)
		console.log(`🗑️  Dropped database "${dbName}".`)
		await admin.query(`CREATE DATABASE ${dbName}`)
		console.log(`📦 Created database "${dbName}".`)
	} finally {
		await admin.end()
	}
}

main().catch(err => {
	console.error(err)
	process.exit(1)
})
