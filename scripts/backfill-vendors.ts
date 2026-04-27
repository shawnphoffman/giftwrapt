/**
 * One-shot backfill: populate items.vendor_id and items.vendor_source
 * for rows that already have a URL but were inserted before the vendor
 * columns existed.
 *
 * Idempotent: only touches rows where vendor_source IS NULL. Manual /
 * AI / rule rows are left alone, so re-running is safe.
 *
 * Usage:
 *   pnpm tsx --env-file=.env.local scripts/backfill-vendors.ts
 *
 * Delete this script after it has run on every environment that matters.
 */

import { config } from 'dotenv'
import { eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import pino from 'pino'

import { items } from '@/db/schema'
import { getVendorFromUrl } from '@/lib/urls'

config()

const log = pino({
	level: process.env.LOG_LEVEL ?? 'info',
	base: { service: 'giftwrapt', scope: 'backfill-vendors' },
	timestamp: pino.stdTimeFunctions.isoTime,
})

const url = process.env.DATABASE_URL
if (!url) {
	log.error('DATABASE_URL is not set')
	process.exit(1)
}

const pool = new Pool({ connectionString: url })
const db = drizzle(pool)

const started = Date.now()
try {
	const rows = await db
		.select({ id: items.id, url: items.url })
		.from(items)
		.where(sql`${items.url} IS NOT NULL AND ${items.vendorSource} IS NULL`)

	log.info({ candidateCount: rows.length }, 'loaded candidate items')

	let updated = 0
	let skipped = 0
	await db.transaction(async tx => {
		for (const row of rows) {
			const vendor = row.url ? getVendorFromUrl(row.url) : null
			if (!vendor) {
				skipped++
				continue
			}
			await tx.update(items).set({ vendorId: vendor.id, vendorSource: 'rule' }).where(eq(items.id, row.id))
			updated++
		}
	})

	// Summary by vendor_source for sanity.
	const summary = await db
		.select({ vendorSource: items.vendorSource, count: sql<number>`count(*)::int` })
		.from(items)
		.groupBy(items.vendorSource)
	const withUrl = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(items)
		.where(isNotNull(items.url))
	const withoutUrl = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(items)
		.where(isNull(items.url))

	log.info(
		{
			durationMs: Date.now() - started,
			updated,
			skipped,
			summary,
			itemsWithUrl: withUrl[0]?.count ?? 0,
			itemsWithoutUrl: withoutUrl[0]?.count ?? 0,
		},
		'backfill complete'
	)
} catch (err) {
	log.error({ err, durationMs: Date.now() - started }, 'backfill failed')
	throw err
} finally {
	await pool.end()
}
