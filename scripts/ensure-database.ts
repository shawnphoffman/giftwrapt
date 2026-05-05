/**
 * Ensures the database named in DATABASE_URL exists on the Postgres instance.
 * Connects to the maintenance DB `postgres`, then CREATE DATABASE if missing.
 *
 * Intended for local/docker URLs only (same host allowlist as seed scripts).
 *
 * Usage:
 *   tsx --env-file=.env.local.screenshots scripts/ensure-database.ts
 */

import pg from 'pg'

function assertLocalDatabaseUrl() {
	const urlStr = process.env.DATABASE_URL
	if (!urlStr) throw new Error('DATABASE_URL is not set.')

	let host: string
	try {
		host = new URL(urlStr).hostname
	} catch {
		throw new Error(`DATABASE_URL is not a valid URL: ${urlStr}`)
	}

	const safeHosts = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal', 'postgres', 'db'])
	if (!safeHosts.has(host)) {
		throw new Error(`Refusing to ensure DB: DATABASE_URL host "${host}" is not in the local/docker allowlist.`)
	}
}

async function main() {
	assertLocalDatabaseUrl()

	const raw = process.env.DATABASE_URL!
	const base = new URL(raw)
	const dbName = decodeURIComponent(base.pathname.replace(/^\//, '').split('/')[0])
	if (!dbName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) {
		throw new Error(`Invalid or unsupported Postgres database name "${dbName}" in DATABASE_URL (use letters, digits, underscore only).`)
	}

	base.pathname = '/postgres'
	const admin = new pg.Client({ connectionString: base.toString() })
	await admin.connect()
	try {
		const { rows } = await admin.query<{ exists: boolean }>(
			`select exists(select 1 from pg_catalog.pg_database where datname = $1) as "exists"`,
			[dbName]
		)
		if (rows[0]?.exists) {
			console.log(`📦 Database "${dbName}" already exists.`)
			return
		}
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
