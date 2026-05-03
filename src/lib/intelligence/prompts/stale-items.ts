import { z } from 'zod'

// Asks the model to confirm + annotate stale items the heuristic already
// pre-selected. NEVER includes claim data or items that are archived.

export const staleItemsRecSchema = z.object({
	include: z.boolean(),
	severity: z.enum(['info', 'suggest', 'important']),
	headline: z.string().min(1).max(120),
	rationale: z.string().min(1).max(280),
})

export const staleItemsResponseSchema = z.object({
	recs: z.array(staleItemsRecSchema).max(8),
})

export type StaleItemsResponse = z.infer<typeof staleItemsResponseSchema>

export type StaleItemsCandidate = {
	itemId: string
	title: string
	listName: string
	listType: string
	updatedAt: Date
	availability: 'available' | 'unavailable'
}

export function buildStaleItemsPrompt(args: { candidates: ReadonlyArray<StaleItemsCandidate>; now: Date }): string {
	const { candidates, now } = args
	const lines = candidates.map((c, i) => {
		const days = Math.max(0, Math.floor((now.getTime() - c.updatedAt.getTime()) / 86400000))
		return `${i + 1}. "${c.title}" - on list "${c.listName}" (${c.listType}), last edited ${days} days ago, ${c.availability}`
	})
	return [
		'You are a wishlist hygiene assistant. The user owns the items below. Each one has not been edited in a long time.',
		'Decide which (if any) deserve a "consider cleaning up" recommendation. Be conservative: items that are still relevant should NOT be flagged.',
		'For each item respond whether to include it, the severity (info/suggest/important), a short headline, and a one-sentence rationale.',
		'NEVER mention gift claims, gifters, recipients, or who has purchased anything. You do not have that information.',
		'',
		'Items:',
		...lines,
	].join('\n')
}
