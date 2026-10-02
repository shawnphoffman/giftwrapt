import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { count, eq } from 'drizzle-orm'
import { z } from 'zod'

import { bulkCreateItemsImpl } from '@/api/_import-impl'
import { searchMyItemsImpl } from '@/api/_item-search-impl'
import { archiveItemsImpl, moveItemsToListImpl, setItemAvailabilityImpl } from '@/api/_items-extra-impl'
import { createItemImpl, deleteItemImpl, updateItemImpl } from '@/api/_items-impl'
import { getMyListsImpl } from '@/api/_lists-impl'
import { lookupProductByBarcodeImpl } from '@/api/_products-impl'
import { availabilityEnumValues, giftedItems, listTypeEnumValues, priorityEnumValues } from '@/db/schema'
import { barcodeLookupLimiter, scrapeLimiter } from '@/lib/rate-limits'
import { runOneShotScrape } from '@/lib/scrapers/run'
import type { ScrapeResult } from '@/lib/scrapers/types'

import type { ToolContext } from '../context'
import { toolError, toolOk } from '../errors'
import { lines, plural } from '../format'
import { defineTool } from '../server'
import { itemLine, itemSchema, toItemShape } from '../shapes'

// Scrape-backed tools get a bounded wall-clock budget so a slow site
// cannot eat the whole serverless function window. /api/mcp deliberately
// shares the app's single Vercel function: a per-route `functionRules`
// entry made nitro emit a second function whose bundle lacked the Sentry
// instrumentation dependency (`import-in-the-middle`) and crashed on
// import, so don't reintroduce one.
const SCRAPE_BUDGET_MS = 45_000

const scrapeSchema = z.object({
	title: z.string().nullable(),
	description: z.string().nullable(),
	price: z.string().nullable(),
	currency: z.string().nullable(),
	imageUrls: z.array(z.string()),
	siteName: z.string().nullable(),
	finalUrl: z.string().nullable(),
	purchaseVariants: z.array(z.string()).describe('Choices the buyer must make, e.g. Color, Size'),
	provider: z.string(),
	cached: z.boolean(),
})

function toScrapeShape(result: ScrapeResult, provider: string, cached: boolean): z.infer<typeof scrapeSchema> {
	return {
		title: result.title ?? null,
		description: result.description ?? null,
		price: result.price ?? null,
		currency: result.currency ?? null,
		imageUrls: result.imageUrls,
		siteName: result.siteName ?? null,
		finalUrl: result.finalUrl ?? null,
		purchaseVariants: result.purchaseVariants ?? [],
		provider,
		cached,
	}
}

function isHttpUrl(value: string): boolean {
	try {
		const u = new URL(value)
		return u.protocol === 'http:' || u.protocol === 'https:'
	} catch {
		return false
	}
}

async function resolvePrimaryListId(ctx: ToolContext): Promise<number | null> {
	const mine = await getMyListsImpl(ctx.actor.userId, ctx.dbx)
	const primary = [...mine.public, ...mine.private, ...mine.giftIdeas].find(l => l.isPrimary)
	return primary?.id ?? null
}

type ScrapeOutcome = { kind: 'ok'; result: ScrapeResult; provider: string; cached: boolean } | { kind: 'error'; reason: string }

async function scrape(url: string, ctx: ToolContext): Promise<ScrapeOutcome> {
	if (!isHttpUrl(url)) return { kind: 'error', reason: 'invalid-url' }
	const limit = scrapeLimiter.consume(`user:${ctx.actor.userId}`)
	if (!limit.allowed) return { kind: 'error', reason: 'rate-limited' }
	const outcome = await runOneShotScrape({ url, userId: ctx.actor.userId, source: 'mcp', signal: AbortSignal.timeout(SCRAPE_BUDGET_MS) })
	if (outcome.kind === 'error') return { kind: 'error', reason: outcome.reason }
	return { kind: 'ok', result: outcome.result, provider: outcome.fromProvider, cached: outcome.cached }
}

const draftFields = {
	title: z.string().max(500).optional(),
	url: z.string().max(2000).optional(),
	price: z.string().max(50).optional().describe('Number as text, e.g. "24.99"'),
	currency: z.string().max(10).optional().describe('ISO code, e.g. USD'),
	notes: z.string().max(5000).optional(),
	priority: z.enum(priorityEnumValues).optional(),
	quantity: z.number().int().positive().max(999).optional(),
}

export function registerItemTools(server: McpServer, ctx: ToolContext): void {
	defineTool(server, ctx, {
		name: 'add_item',
		title: 'Add Item',
		description:
			'Add one item to a list the user owns or can edit (defaults to their primary list). Give a title, a product URL, or both. With a URL the page is read to fill in the title, price, and image unless enrich is false; pass your own values to override what the page says.',
		inputSchema: {
			list_id: z.number().int().positive().optional().describe('Defaults to the primary list'),
			...draftFields,
			enrich: z.boolean().optional().describe('Read the URL to fill missing fields (default true)'),
		},
		outputSchema: { item: itemSchema, enriched: z.boolean(), scrape: scrapeSchema.nullable() },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
		handler: async (args, toolCtx) => {
			const listId = args.list_id ?? (await resolvePrimaryListId(toolCtx))
			if (!listId) return toolError('no-primary-list')
			const url = args.url?.trim() || undefined
			if (!args.title?.trim() && !url) return toolError('invalid-input', 'Give a title or a URL.')
			if (url && !isHttpUrl(url)) return toolError('invalid-url')

			let scraped: z.infer<typeof scrapeSchema> | null = null
			let title = args.title?.trim()
			let price = args.price
			let currency = args.currency
			let notes = args.notes
			let imageUrl: string | undefined
			const enrich = args.enrich ?? true
			if (url && enrich) {
				const s = await scrape(url, toolCtx)
				if (s.kind === 'ok') {
					scraped = toScrapeShape(s.result, s.provider, s.cached)
					title ||= s.result.title?.trim()
					price ??= s.result.price
					currency ??= s.result.currency
					imageUrl = s.result.imageUrls[0]
					if (!notes && s.result.purchaseVariants?.length) notes = s.result.purchaseVariants.map(v => `- ${v}: `).join('\n')
				}
			}
			if (!title) title = new URL(url!).hostname.replace(/^www\./u, '')

			const result = await createItemImpl({
				db: toolCtx.dbx,
				actor: { id: toolCtx.actor.userId },
				input: { listId, title, url, price, currency, notes, priority: args.priority, quantity: args.quantity, imageUrl },
			})
			if (result.kind === 'error') return toolError(result.reason)
			const item = toItemShape(result.item)
			const note = scraped
				? `Details filled in from ${scraped.siteName ?? 'the page'}.`
				: url && enrich
					? 'The page could not be read; the item was added with what you gave.'
					: ''
			return toolOk(lines([`Added ${itemLine(item)} to list #${listId}.`, note].filter(Boolean)), {
				item,
				enriched: scraped !== null,
				scrape: scraped,
			})
		},
	})

	defineTool(server, ctx, {
		name: 'add_items',
		title: 'Add Many Items',
		description:
			'Add several items at once (a brain dump or a pasted list). Each needs a title or a URL. URLs are enriched in the background by the import queue rather than while you wait. Requires the deployment’s import feature.',
		inputSchema: {
			list_id: z.number().int().positive().optional().describe('Defaults to the primary list'),
			items: z.array(z.object(draftFields)).min(1).max(50),
		},
		outputSchema: { items: z.array(itemSchema), enqueued: z.number().describe('URLs queued for background enrichment') },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
		handler: async (args, toolCtx) => {
			const listId = args.list_id ?? (await resolvePrimaryListId(toolCtx))
			if (!listId) return toolError('no-primary-list')
			const result = await bulkCreateItemsImpl({
				db: toolCtx.dbx,
				actor: { id: toolCtx.actor.userId },
				input: {
					listId,
					items: args.items.map(d => ({
						title: d.title ?? null,
						url: d.url ?? null,
						price: d.price ?? null,
						currency: d.currency ?? null,
						notes: d.notes ?? null,
						priority: d.priority,
						quantity: d.quantity,
					})),
				},
			})
			if (result.kind === 'error') return toolError(result.reason)
			const items = result.items.map(i => toItemShape(i))
			const head = `Added ${plural(items.length, 'item')} to list #${listId}${result.enqueued ? `; ${result.enqueued} queued for enrichment` : ''}.`
			return toolOk(lines([head, ...items.map(itemLine)]), { items, enqueued: result.enqueued })
		},
	})

	defineTool(server, ctx, {
		name: 'update_item',
		title: 'Update Item',
		description:
			'Change an item’s title, URL, price, notes, priority, quantity, or image. Pass null to clear a nullable field. Only fields you pass change.',
		inputSchema: {
			item_id: z.number().int().positive(),
			title: z.string().min(1).max(500).optional(),
			url: z.string().max(2000).nullable().optional(),
			price: z.string().max(50).nullable().optional(),
			currency: z.string().max(10).nullable().optional(),
			notes: z.string().max(5000).nullable().optional(),
			priority: z.enum(priorityEnumValues).optional(),
			quantity: z.number().int().positive().max(999).optional(),
			image_url: z.string().max(2000).nullable().optional(),
		},
		outputSchema: { item: itemSchema },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		handler: async (args, { actor, dbx }) => {
			const result = await updateItemImpl({
				db: dbx,
				actor: { id: actor.userId },
				input: {
					itemId: args.item_id,
					title: args.title,
					url: args.url,
					price: args.price,
					currency: args.currency,
					notes: args.notes,
					priority: args.priority,
					quantity: args.quantity,
					imageUrl: args.image_url,
				},
			})
			if (result.kind === 'error') return toolError(result.reason)
			const item = toItemShape(result.item)
			return toolOk(`Updated ${itemLine(item)}.`, { item })
		},
	})

	defineTool(server, ctx, {
		name: 'delete_item',
		title: 'Delete Item',
		description:
			'Remove an item from one of the user’s lists. If a gifter had already claimed it, the item quietly enters a pending-deletion state and the gifter is alerted; the user never sees that difference. Confirm with the user first.',
		inputSchema: { item_id: z.number().int().positive() },
		outputSchema: { ok: z.literal(true), itemId: z.number() },
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		handler: async (args, { actor, dbx }) => {
			const result = await deleteItemImpl({ db: dbx, actor: { id: actor.userId }, input: { itemId: args.item_id } })
			if (result.kind === 'error') return toolError(result.reason)
			return toolOk(`Deleted item #${args.item_id}.`, { ok: true as const, itemId: args.item_id })
		},
	})

	defineTool(server, ctx, {
		name: 'move_items',
		title: 'Move Items',
		description:
			'Move items to another list the user can edit. Moving between lists of different types (for example wishlist to gift-ideas) clears any claims gifters had made, so confirm with the user first.',
		inputSchema: { item_ids: z.array(z.number().int().positive()).min(1).max(500), target_list_id: z.number().int().positive() },
		outputSchema: { moved: z.number(), targetListId: z.number() },
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
		handler: async (args, { actor }) => {
			const result = await moveItemsToListImpl({
				userId: actor.userId,
				input: { itemIds: args.item_ids, targetListId: args.target_list_id, purgeComments: false },
			})
			if (result.kind === 'error') return toolError(result.reason)
			return toolOk(`Moved ${plural(result.moved, 'item')} to list #${args.target_list_id}.`, {
				moved: result.moved,
				targetListId: args.target_list_id,
			})
		},
	})

	defineTool(server, ctx, {
		name: 'set_item_availability',
		title: 'Set Item Availability',
		description: 'Mark an item unavailable (sold out, discontinued) so gifters skip it, or available again.',
		inputSchema: { item_id: z.number().int().positive(), availability: z.enum(availabilityEnumValues) },
		outputSchema: { item: itemSchema },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		handler: async (args, { actor, dbx }) => {
			if (args.availability === 'unavailable') {
				// logic.md "Availability and claims are mutually exclusive": the
				// server does not enforce this, so every programmatic surface
				// must. The refusal stays generic so it never tells the
				// recipient that a claim exists.
				const rows = await dbx.select({ c: count() }).from(giftedItems).where(eq(giftedItems.itemId, args.item_id))
				if ((rows.at(0)?.c ?? 0) > 0) return toolError('not-allowed')
			}
			const result = await setItemAvailabilityImpl({
				userId: actor.userId,
				input: { itemId: args.item_id, availability: args.availability },
				dbx,
			})
			if (result.kind === 'error') return toolError(result.reason === 'not-visible' ? 'not-found' : result.reason)
			const item = toItemShape(result.item)
			return toolOk(`${itemLine(item)} is now ${args.availability}.`, { item })
		},
	})

	defineTool(server, ctx, {
		name: 'archive_items',
		title: 'Mark Items Received',
		description:
			'Archive items on the user’s own list to mark them received. This REVEALS who gave each gift to the user, so only do it after the occasion, when they ask. Pass archived false to undo.',
		inputSchema: {
			item_ids: z.array(z.number().int().positive()).min(1).max(500),
			archived: z.boolean().optional().describe('default true'),
		},
		outputSchema: { updated: z.number(), archived: z.boolean() },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		handler: async (args, { actor }) => {
			const archived = args.archived ?? true
			const result = await archiveItemsImpl({ userId: actor.userId, input: { itemIds: args.item_ids, archived } })
			if (result.kind === 'error') return toolError(result.reason)
			return toolOk(`${archived ? 'Marked' : 'Unmarked'} ${plural(result.updated, 'item')} as received.`, {
				updated: result.updated,
				archived,
			})
		},
	})

	defineTool(server, ctx, {
		name: 'search_my_items',
		title: 'Search My Items',
		description:
			'Find items across every list the user owns by words in the title or notes. Results from gift-ideas lists (isGiftIdea true) are the user’s private ideas for someone else, not things the user or that person asked for.',
		inputSchema: { query: z.string().min(1).max(200) },
		outputSchema: {
			items: z.array(
				z.object({
					id: z.number(),
					title: z.string(),
					listId: z.number(),
					listName: z.string(),
					listType: z.enum(listTypeEnumValues),
					isGiftIdea: z.boolean().describe('From a gift-ideas list: the user’s private idea for someone else, not a wish'),
					url: z.string().nullable(),
					price: z.string().nullable(),
					currency: z.string().nullable(),
				})
			),
			totalMatches: z.number(),
		},
		annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
		handler: async (args, { actor, dbx }) => {
			const result = await searchMyItemsImpl({ userId: actor.userId, query: args.query }, dbx)
			if (result.kind === 'query-too-short') return toolError('query-too-short', `Use at least ${result.minLength} characters.`)
			const items = result.items.map(i => ({
				id: i.itemId,
				title: i.title,
				listId: i.listId,
				listName: i.listName,
				listType: i.listType,
				isGiftIdea: i.listType === 'giftideas',
				url: i.url,
				price: i.price,
				currency: i.currency,
			}))
			const text = items.length
				? lines([
						`${result.totalMatches} matches.`,
						...items.map(
							i =>
								`#${i.id} ${i.title} (list #${i.listId} "${i.listName}"${i.isGiftIdea ? ', your private gift idea for someone else' : ''})`
						),
					])
				: 'No items match.'
			return toolOk(text, { items, totalMatches: result.totalMatches })
		},
	})

	defineTool(server, ctx, {
		name: 'preview_url',
		title: 'Preview a Product URL',
		description:
			'Read a product page and return its title, price, images, and the choices a buyer must make, without adding anything. Useful before add_item or to check a price.',
		inputSchema: { url: z.string().max(2000) },
		outputSchema: { preview: scrapeSchema },
		annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
		handler: async (args, toolCtx) => {
			const s = await scrape(args.url.trim(), toolCtx)
			if (s.kind === 'error') return toolError(s.reason)
			const preview = toScrapeShape(s.result, s.provider, s.cached)
			const priceText = preview.price ? ` ${preview.price} ${preview.currency ?? ''}`.trimEnd() : ''
			return toolOk(
				lines(
					[
						`${preview.title ?? 'Untitled'}${priceText}`,
						preview.siteName ? `From ${preview.siteName}.` : '',
						preview.purchaseVariants.length ? `Buyer picks: ${preview.purchaseVariants.join(', ')}.` : '',
					].filter(Boolean)
				),
				{ preview }
			)
		},
	})

	defineTool(server, ctx, {
		name: 'lookup_barcode',
		title: 'Look Up a Barcode',
		description:
			'Identify a product from a UPC / EAN barcode number. Returns candidate titles, brands, images, and product URLs to feed into add_item.',
		inputSchema: { code: z.string().min(8).max(32) },
		outputSchema: {
			gtin14: z.string(),
			cached: z.boolean(),
			candidates: z.array(
				z.object({
					title: z.string().nullable(),
					brand: z.string().nullable(),
					imageUrl: z.string().nullable(),
					candidateUrl: z.string().nullable(),
				})
			),
		},
		annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
		handler: async (args, toolCtx) => {
			const limit = barcodeLookupLimiter.consume(`user:${toolCtx.actor.userId}`)
			if (!limit.allowed) return toolError('rate-limited')
			const result = await lookupProductByBarcodeImpl({
				db: toolCtx.dbx,
				rawCode: args.code,
				settings: toolCtx.settings,
				signal: AbortSignal.timeout(SCRAPE_BUDGET_MS),
			})
			if (result.kind === 'error') return toolError(result.reason === 'invalid-code' ? 'invalid-barcode' : result.reason)
			const candidates = result.results.map(c => ({
				title: c.title ?? null,
				brand: c.brand ?? null,
				imageUrl: c.imageUrl ?? null,
				candidateUrl: c.candidateUrl ?? null,
			}))
			const text = candidates.length
				? lines([
						`${plural(candidates.length, 'match', 'matches')} for ${result.gtin14}.`,
						...candidates.map(
							c => `${c.title ?? 'Untitled'}${c.brand ? ` by ${c.brand}` : ''}${c.candidateUrl ? ` ${c.candidateUrl}` : ''}`
						),
					])
				: `No product found for ${result.gtin14}.`
			return toolOk(text, { gtin14: result.gtin14, cached: result.cached, candidates })
		},
	})
}
