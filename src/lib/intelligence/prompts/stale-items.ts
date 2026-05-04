import { z } from 'zod'

// Asks the model to confirm + annotate stale items the heuristic already
// pre-selected, grouped by list. NEVER includes claim data or items that
// are archived.
//
// Batched shape: one call covers ALL of a user's lists with stale items.
// The model groups its response by list so we can still produce a single
// rec per list downstream. Tradeoff vs. per-list calls: fewer round-trips
// (cheaper, faster) but a single error or schema-parse failure kills the
// whole stale-items batch instead of just one list.

// NOTE on schema constraints: OpenAI's structured-output validator rejects
// `maxItems` on arrays (and `min`/`max` on strings). Keep these schemas
// "shape-only" — bound the size by the prompt + post-processing slice in
// the analyzer instead of via Zod modifiers that translate to unsupported
// JSON-schema keywords.
export const staleItemsRecSchema = z.object({
	include: z.boolean(),
	severity: z.enum(['info', 'suggest', 'important']),
	headline: z.string(),
	rationale: z.string(),
})

export const staleItemsListSchema = z.object({
	listId: z.string(),
	recs: z.array(staleItemsRecSchema),
})

export const staleItemsResponseSchema = z.object({
	lists: z.array(staleItemsListSchema),
})

// Soft caps applied post-parse so a misbehaving model can't dump a huge
// payload into our DB. Matches the previous schema-level limits.
export const STALE_ITEMS_MAX_LISTS = 20
export const STALE_ITEMS_MAX_RECS_PER_LIST = 8

export type StaleItemsResponse = z.infer<typeof staleItemsResponseSchema>

export type StaleItemsCandidate = {
	itemId: string
	title: string
	listId: string
	listName: string
	listType: string
	updatedAt: Date
	availability: 'available' | 'unavailable'
}

export function buildStaleItemsPrompt(args: { candidates: ReadonlyArray<StaleItemsCandidate>; now: Date }): string {
	const { candidates, now } = args

	// Group by list so the prompt mirrors the response shape: easier for
	// the model to keep listIds straight when it emits its grouped output.
	const byList = new Map<string, { listName: string; listType: string; items: Array<StaleItemsCandidate> }>()
	for (const c of candidates) {
		const cur = byList.get(c.listId) ?? { listName: c.listName, listType: c.listType, items: [] }
		cur.items.push(c)
		byList.set(c.listId, cur)
	}

	const sections: Array<string> = []
	for (const [listId, group] of byList.entries()) {
		const lines = group.items.map((c, i) => {
			const days = Math.max(0, Math.floor((now.getTime() - c.updatedAt.getTime()) / 86400000))
			return `  ${i + 1}. "${c.title}" - last edited ${days} days ago, ${c.availability}`
		})
		sections.push([`List id=${listId} name="${group.listName}" type=${group.listType}`, ...lines].join('\n'))
	}

	return [
		'You are a wishlist hygiene assistant. The user owns the items below, grouped by list. Each item has not been edited in a long time.',
		'Decide which (if any) deserve a "consider cleaning up" recommendation. Be conservative: items that are still relevant should NOT be flagged.',
		'Respond grouped by list, echoing each listId exactly as given. For each list, include 0+ recs (skip lists where nothing should be flagged).',
		'For each rec respond whether to include it, the severity (info/suggest/important), a short headline, and a one-sentence rationale.',
		'NEVER mention gift claims, gifters, recipients, or who has purchased anything. You do not have that information.',
		'',
		'Lists:',
		...sections,
	].join('\n')
}
