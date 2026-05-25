import { createServerFn } from '@tanstack/react-start'
import { and, count, desc, eq, gte, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { items, itemScrapes, lists, users } from '@/db/schema'
import { loggingMiddleware } from '@/lib/logger'
import { adminAuthMiddleware } from '@/middleware/auth'

// Server fns powering /admin/scrapes, a debugging view for inspecting
// every scrape attempt's persisted row. Useful when the streaming UX
// reports a green provider but the form prefill came up empty: load the
// detail, look at the raw `response` jsonb + the per-column extracted
// fields, and figure out which step lost the data.

const LIST_LIMIT = 200

export type ScrapeListRow = {
	id: number
	url: string
	scraperId: string
	ok: boolean
	score: number | null
	ms: number | null
	errorCode: string | null
	createdAt: Date
	itemId: number | null
	itemTitle: string | null
	listId: number | null
	listName: string | null
	userId: string | null
	userName: string | null
	userEmail: string | null
}

// Recent attempts, newest first. No filters yet; the page is small enough
// that the most recent N is exactly what an admin wants when chasing a
// fresh bug. Joined to items + lists + users so the table can render
// human-friendly columns without a per-row round-trip.
export const listScrapesAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.handler(async (): Promise<Array<ScrapeListRow>> => {
		const rows = await db
			.select({
				id: itemScrapes.id,
				url: itemScrapes.url,
				scraperId: itemScrapes.scraperId,
				ok: itemScrapes.ok,
				score: itemScrapes.score,
				ms: itemScrapes.ms,
				errorCode: itemScrapes.errorCode,
				createdAt: itemScrapes.createdAt,
				itemId: itemScrapes.itemId,
				itemTitle: items.title,
				listId: items.listId,
				listName: lists.name,
				userId: itemScrapes.userId,
				userName: users.name,
				userEmail: users.email,
			})
			.from(itemScrapes)
			.leftJoin(items, eq(items.id, itemScrapes.itemId))
			.leftJoin(lists, eq(lists.id, items.listId))
			.leftJoin(users, eq(users.id, itemScrapes.userId))
			.orderBy(desc(itemScrapes.createdAt))
			.limit(LIST_LIMIT)
		return rows
	})

const ScrapeIdSchema = z.object({ id: z.number().int().positive() })

// `response` carries whatever the orchestrator stashed in the jsonb column
// at persist time. Usually a structured object, but always JSON-shaped.
// `unknown` would be stricter but TanStack's RPC inferrer narrows it back
// to `{}`; this looser shape survives the trip and is what the dialog ends
// up `JSON.stringify`-ing anyway.
export type ScrapeResponseJson = string | number | boolean | null | Array<ScrapeResponseJson> | { [key: string]: ScrapeResponseJson }

export type ScrapeDetail = ScrapeListRow & {
	title: string | null
	cleanTitle: string | null
	description: string | null
	price: string | null
	currency: string | null
	imageUrls: Array<string> | null
	response: ScrapeResponseJson | null
}

export type ScrapeDetailResult = { kind: 'ok'; detail: ScrapeDetail } | { kind: 'error'; reason: 'not-found' }

export const getScrapeDetailAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ScrapeIdSchema>) => ScrapeIdSchema.parse(data))
	.handler(async ({ data }): Promise<ScrapeDetailResult> => {
		const rows = await db
			.select({
				id: itemScrapes.id,
				url: itemScrapes.url,
				scraperId: itemScrapes.scraperId,
				ok: itemScrapes.ok,
				score: itemScrapes.score,
				ms: itemScrapes.ms,
				errorCode: itemScrapes.errorCode,
				createdAt: itemScrapes.createdAt,
				itemId: itemScrapes.itemId,
				itemTitle: items.title,
				listId: items.listId,
				listName: lists.name,
				userId: itemScrapes.userId,
				userName: users.name,
				userEmail: users.email,
				title: itemScrapes.title,
				cleanTitle: itemScrapes.cleanTitle,
				description: itemScrapes.description,
				price: itemScrapes.price,
				currency: itemScrapes.currency,
				imageUrls: itemScrapes.imageUrls,
				response: itemScrapes.response,
			})
			.from(itemScrapes)
			.leftJoin(items, eq(items.id, itemScrapes.itemId))
			.leftJoin(lists, eq(lists.id, items.listId))
			.leftJoin(users, eq(users.id, itemScrapes.userId))
			.where(eq(itemScrapes.id, data.id))
			.limit(1)
		if (rows.length === 0) return { kind: 'error', reason: 'not-found' }
		const row = rows[0]
		return { kind: 'ok', detail: { ...row, response: row.response as ScrapeResponseJson | null } }
	})

// ─── Scrape Health stats ────────────────────────────────────────────────────
//
// Per-provider aggregate (cheap GROUP BY in SQL) + raw failure rows (capped)
// for client-side hostname / error-code aggregation. We deliberately don't
// pull successes — they outnumber failures by orders of magnitude and the
// reporting view only cares about what went wrong. Domain extraction stays
// in TS so we get `URL`-parser correctness (ports, IDN, query strings)
// instead of regex-in-SQL approximations.

export const SCRAPE_WINDOW_HOURS = [24, 168, 720] as const
export type ScrapeWindowHours = (typeof SCRAPE_WINDOW_HOURS)[number]

const FAILURE_FETCH_CAP = 5000

export type ScrapeProviderStat = {
	scraperId: string
	total: number
	okCount: number
	failCount: number
	avgMs: number | null
	p95Ms: number | null
}

export type ScrapeFailureRow = {
	url: string
	scraperId: string
	errorCode: string | null
	ms: number | null
	createdAt: Date
}

export type ScrapeStats = {
	windowHours: ScrapeWindowHours
	generatedAt: Date
	totals: { total: number; ok: number; fail: number }
	providers: Array<ScrapeProviderStat>
	failures: Array<ScrapeFailureRow>
	failuresTruncated: boolean
}

const ScrapeStatsInputSchema = z.object({
	windowHours: z.union([z.literal(24), z.literal(168), z.literal(720)]),
})

export const getScrapeStatsAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ScrapeStatsInputSchema>) => ScrapeStatsInputSchema.parse(data))
	.handler(async ({ data }): Promise<ScrapeStats> => {
		const since = new Date(Date.now() - data.windowHours * 3600 * 1000)
		const [providerRows, failureRows] = await Promise.all([
			db
				.select({
					scraperId: itemScrapes.scraperId,
					total: count(),
					// count(*) filter (where ...) returns bigint; cast keeps it as JS number.
					okCount: sql<number>`(count(*) filter (where ${itemScrapes.ok}))::int`,
					failCount: sql<number>`(count(*) filter (where not ${itemScrapes.ok}))::int`,
					// avg(int) returns numeric (driver hands back string), so cast to
					// double precision (oid 701) which the pg driver parses as a JS
					// number. NULL stays NULL when no rows in the group have ms set.
					avgMs: sql<number | null>`avg(${itemScrapes.ms})::float8`,
					p95Ms: sql<number | null>`(percentile_cont(0.95) within group (order by ${itemScrapes.ms}))::float8`,
				})
				.from(itemScrapes)
				.where(gte(itemScrapes.createdAt, since))
				.groupBy(itemScrapes.scraperId)
				.orderBy(desc(count())),
			db
				.select({
					url: itemScrapes.url,
					scraperId: itemScrapes.scraperId,
					errorCode: itemScrapes.errorCode,
					ms: itemScrapes.ms,
					createdAt: itemScrapes.createdAt,
				})
				.from(itemScrapes)
				.where(and(gte(itemScrapes.createdAt, since), eq(itemScrapes.ok, false)))
				.orderBy(desc(itemScrapes.createdAt))
				.limit(FAILURE_FETCH_CAP + 1),
		])

		const totals = providerRows.reduce(
			(acc, r) => {
				acc.total += r.total
				acc.ok += r.okCount
				acc.fail += r.failCount
				return acc
			},
			{ total: 0, ok: 0, fail: 0 }
		)

		const truncated = failureRows.length > FAILURE_FETCH_CAP
		const failures = truncated ? failureRows.slice(0, FAILURE_FETCH_CAP) : failureRows

		return {
			windowHours: data.windowHours,
			generatedAt: new Date(),
			totals,
			providers: providerRows.map(r => ({
				scraperId: r.scraperId,
				total: r.total,
				okCount: r.okCount,
				failCount: r.failCount,
				avgMs: r.avgMs,
				p95Ms: r.p95Ms,
			})),
			failures,
			failuresTruncated: truncated,
		}
	})
