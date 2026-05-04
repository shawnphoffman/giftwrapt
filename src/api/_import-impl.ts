// Server-only impl for the bulk-import flow on the list-edit page. The
// public surface is just `bulkCreateItemsImpl` for now; the
// source-specific parsers (Apple Notes, Amazon, URL paste) live on the
// other side of the planned split (Session C). All three shapes
// converge on the same `ItemDraft[]` payload that this impl consumes.
//
// Logic-doc rules this impl honors (see `.notes/logic.md` § Items):
//   - never insert with `isArchived=true`
//   - never insert with `availability='unavailable'`
//   - vendor is derived from URL via the same rule chain `createItemImpl`
//     uses (see `getVendorFromUrl`); items without URLs leave it null
//   - items with URLs enqueue a background scrape job via the queue
//     runner so empty title/image/price get filled by `runOneShotScrape`
//     once the cron tick reaches them

import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { type SchemaDatabase } from '@/db'
import { items, lists } from '@/db/schema'
import { priorityEnumValues } from '@/db/schema/enums'
import type { Item } from '@/db/schema/items'
import { httpsUpgradeOrNull } from '@/lib/image-url'
import { enqueueScrapeJob } from '@/lib/import/scrape-queue/runner'
import { canEditList } from '@/lib/permissions'
import { getAppSettings } from '@/lib/settings-loader'
import { getVendorFromUrl } from '@/lib/urls'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

// Each draft must have at least one of `title` or `url`. Title fallback
// for URL-only drafts is the URL's hostname, matching the inline
// scrape-on-blur UX in `add-item-dialog.tsx`: the user sees a
// recognizable placeholder while the queue fills in real metadata.
const ItemDraftSchema = z
	.object({
		title: z.string().max(500).nullable().optional(),
		url: z.string().max(2000).nullable().optional(),
		price: z.string().max(50).nullable().optional(),
		currency: z.string().max(10).nullable().optional(),
		imageUrl: z.string().max(2000).nullable().optional(),
		notes: z.string().max(5000).nullable().optional(),
		priority: z.enum(priorityEnumValues).optional(),
		quantity: z.number().int().positive().max(999).optional(),
	})
	.refine(d => (d.title && d.title.trim().length > 0) || (d.url && d.url.trim().length > 0), {
		message: 'Each item must have at least a title or a url',
	})

export type ItemDraft = z.infer<typeof ItemDraftSchema>

export const BulkCreateItemsInputSchema = z.object({
	listId: z.number().int().positive(),
	items: z.array(ItemDraftSchema).min(1).max(200),
})

export type BulkCreateItemsResult =
	| { kind: 'ok'; items: Array<Item>; enqueued: number }
	| { kind: 'error'; reason: 'list-not-found' | 'not-authorized' | 'feature-disabled' }

// ---------------------------------------------------------------------------
// Impl
// ---------------------------------------------------------------------------

export async function bulkCreateItemsImpl(args: {
	db: SchemaDatabase
	actor: { id: string }
	input: z.output<typeof BulkCreateItemsInputSchema>
}): Promise<BulkCreateItemsResult> {
	const { db: dbx, actor, input } = args
	const userId = actor.id

	const settings = await getAppSettings(dbx)
	if (!settings.importEnabled) {
		return { kind: 'error', reason: 'feature-disabled' }
	}

	const list = await dbx.query.lists.findFirst({
		where: eq(lists.id, input.listId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { kind: 'error', reason: 'list-not-found' }

	if (list.ownerId !== userId) {
		const edit = await canEditList(userId, list, dbx)
		if (!edit.ok) return { kind: 'error', reason: 'not-authorized' }
	}

	const inserted = await dbx.transaction(async tx => {
		const rows: Array<Item> = []
		for (const draft of input.items) {
			const url = nonEmpty(draft.url)
			const vendor = url ? getVendorFromUrl(url) : null
			const title = resolveTitle(draft.title, url)

			const [row] = await tx
				.insert(items)
				.values({
					listId: input.listId,
					title,
					url,
					vendorId: vendor?.id ?? null,
					vendorSource: vendor ? 'rule' : null,
					price: nonEmpty(draft.price),
					currency: nonEmpty(draft.currency),
					notes: nonEmpty(draft.notes),
					priority: draft.priority ?? 'normal',
					quantity: draft.quantity ?? 1,
					imageUrl: httpsUpgradeOrNull(nonEmpty(draft.imageUrl)),
					// Defaults from the schema match the logic.md invariants but
					// being explicit here is a guard against future column-default
					// drift bypassing the bulk path.
					isArchived: false,
					availability: 'available',
				})
				.returning()
			rows.push(row)
		}
		return rows
	})

	// Enqueue scrape jobs for items with URLs. Done outside the
	// transaction so a background-queue insert failure doesn't roll back
	// the user's whole import; an item without a job just won't get
	// metadata filled in, which is recoverable (the user can re-trigger
	// from the row UI).
	let enqueued = 0
	for (const row of inserted) {
		if (!row.url) continue
		try {
			const r = await enqueueScrapeJob(dbx, { itemId: row.id, userId, url: row.url })
			if (r.kind === 'enqueued') enqueued++
		} catch {
			// best-effort; matches the pattern at create-time inline scrape sites
		}
	}

	return { kind: 'ok', items: inserted, enqueued }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nonEmpty(value: string | null | undefined): string | null {
	if (value === null || value === undefined) return null
	const trimmed = value.trim()
	return trimmed.length > 0 ? trimmed : null
}

// Title fallback: URL hostname if we have a URL, "Untitled" otherwise.
// The scrape-queue runner treats hostname-only titles as "blank" via
// `isBlankTitleSubstitute` so a real title from the scrape can replace
// it without clobbering a user-typed value.
function resolveTitle(rawTitle: string | null | undefined, url: string | null): string {
	const trimmed = rawTitle?.trim()
	if (trimmed && trimmed.length > 0) return trimmed
	if (url) {
		try {
			const host = new URL(url).hostname
			if (host) return host.replace(/^www\./, '')
		} catch {
			// fall through to default
		}
	}
	return 'Untitled'
}
