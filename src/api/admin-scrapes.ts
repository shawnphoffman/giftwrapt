import { createServerFn } from '@tanstack/react-start'
import { desc, eq } from 'drizzle-orm'
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
