import { createServerFn } from '@tanstack/react-start'
import { and, count, desc, eq, gte, inArray, max, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { cronRuns, cronRunStatusEnumValues } from '@/db/schema'
import { cronHandlers } from '@/lib/cron/handlers'
import { recordCronRun } from '@/lib/cron/record-run'
import { CRON_ENDPOINTS, type CronEndpoint, cronRegistry } from '@/lib/cron/registry'
import { createLogger, loggingMiddleware } from '@/lib/logger'
import { adminAuthMiddleware } from '@/middleware/auth'

const log = createLogger('admin:cron')

const listInput = z.object({
	endpoint: z.union([z.enum(CRON_ENDPOINTS as readonly [string, ...Array<string>]), z.literal('all')]).default('all'),
	status: z.union([z.enum(cronRunStatusEnumValues), z.literal('all')]).default('all'),
	pageIndex: z.number().int().min(0).default(0),
	pageSize: z.number().int().min(10).max(200).default(50),
})

export type CronRunsListInput = z.infer<typeof listInput>

export const getCronRunsAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: CronRunsListInput) => listInput.parse(data))
	.handler(async ({ data }) => {
		const conditions = [
			data.endpoint !== 'all' ? eq(cronRuns.endpoint, data.endpoint) : undefined,
			data.status !== 'all' ? eq(cronRuns.status, data.status) : undefined,
		].filter(Boolean) as Array<NonNullable<Parameters<typeof and>[number]>>
		const where = conditions.length > 0 ? and(...conditions) : undefined

		const [{ total }] = await db
			.select({ total: count() })
			.from(cronRuns)
			.where(where ?? sql`true`)

		const rows = await db
			.select()
			.from(cronRuns)
			.where(where ?? sql`true`)
			.orderBy(desc(cronRuns.startedAt))
			.limit(data.pageSize)
			.offset(data.pageIndex * data.pageSize)

		return { rows, total, pageIndex: data.pageIndex, pageSize: data.pageSize }
	})

// Per-endpoint summary: last successful run, last error, total runs in
// the last 24h. Powers the top "registry" panel on /admin/scheduling.
export const getCronEndpointsSummaryAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.handler(async () => {
		const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

		const lastSuccessRows = await db
			.select({
				endpoint: cronRuns.endpoint,
				lastSuccessAt: max(cronRuns.startedAt),
			})
			.from(cronRuns)
			.where(and(eq(cronRuns.status, 'success'), inArray(cronRuns.endpoint, [...CRON_ENDPOINTS])))
			.groupBy(cronRuns.endpoint)

		const lastAnyRows = await db
			.select({
				endpoint: cronRuns.endpoint,
				lastRunAt: max(cronRuns.startedAt),
			})
			.from(cronRuns)
			.where(inArray(cronRuns.endpoint, [...CRON_ENDPOINTS]))
			.groupBy(cronRuns.endpoint)

		const errorCountRows = await db
			.select({
				endpoint: cronRuns.endpoint,
				errorCount: count(),
			})
			.from(cronRuns)
			.where(and(eq(cronRuns.status, 'error'), gte(cronRuns.startedAt, since24h), inArray(cronRuns.endpoint, [...CRON_ENDPOINTS])))
			.groupBy(cronRuns.endpoint)

		const totalCountRows = await db
			.select({
				endpoint: cronRuns.endpoint,
				totalCount: count(),
			})
			.from(cronRuns)
			.where(and(gte(cronRuns.startedAt, since24h), inArray(cronRuns.endpoint, [...CRON_ENDPOINTS])))
			.groupBy(cronRuns.endpoint)

		const successMap = new Map(lastSuccessRows.map(r => [r.endpoint, r.lastSuccessAt]))
		const lastMap = new Map(lastAnyRows.map(r => [r.endpoint, r.lastRunAt]))
		const errorMap = new Map(errorCountRows.map(r => [r.endpoint, r.errorCount]))
		const totalMap = new Map(totalCountRows.map(r => [r.endpoint, r.totalCount]))

		return cronRegistry.map(entry => ({
			...entry,
			lastSuccessAt: successMap.get(entry.path) ?? null,
			lastRunAt: lastMap.get(entry.path) ?? null,
			errorsLast24h: errorMap.get(entry.path) ?? 0,
			runsLast24h: totalMap.get(entry.path) ?? 0,
		}))
	})

// Manual trigger from /admin/scheduling. Re-uses the same handler the
// HTTP route runs, wrapped in `recordCronRun` so the run shows up in
// history. Refuses if a row for the same endpoint is still 'running'
// (within a 10-minute window, beyond which we assume the row was
// orphaned by a process kill).
const runInput = z.object({
	endpoint: z.enum(CRON_ENDPOINTS as readonly [CronEndpoint, ...Array<CronEndpoint>]),
})

export const runCronAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.infer<typeof runInput>) => runInput.parse(data))
	.handler(async ({ data }) => {
		const orphanCutoff = new Date(Date.now() - 10 * 60 * 1000)
		const inflight = await db
			.select({ id: cronRuns.id })
			.from(cronRuns)
			.where(and(eq(cronRuns.endpoint, data.endpoint), eq(cronRuns.status, 'running'), gte(cronRuns.startedAt, orphanCutoff)))
			.limit(1)
		if (inflight.length > 0) {
			return { ok: false as const, reason: 'already-running' as const }
		}

		const handler = cronHandlers[data.endpoint]
		log.info({ endpoint: data.endpoint }, 'manual cron trigger')
		try {
			const result = await recordCronRun({ endpoint: data.endpoint, run: handler })
			return { ok: true as const, result }
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			return { ok: false as const, reason: 'error' as const, error: message }
		}
	})
