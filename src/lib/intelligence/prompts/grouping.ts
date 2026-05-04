import { z } from 'zod'

// NOTE: keep these schemas shape-only - OpenAI's structured-output
// validator rejects `maxItems` on arrays and `min`/`max` on strings.
// Bound the response with the prompt + a post-parse slice in the analyzer.
export const groupingSuggestionSchema = z.object({
	clusterIndex: z.number(),
	decision: z.enum(['or', 'order', 'skip']),
	itemIds: z.array(z.string()),
	rationale: z.string(),
})

export const groupingResponseSchema = z.object({
	groups: z.array(groupingSuggestionSchema),
})

export type GroupingResponse = z.infer<typeof groupingResponseSchema>

export const GROUPING_MAX_SUGGESTIONS = 4
export const GROUPING_MAX_CLUSTER_SIZE = 6

export type GroupingClusterCandidate = {
	listId: string
	listName: string
	items: ReadonlyArray<{ itemId: string; title: string }>
}

export function buildGroupingPrompt(args: { clusters: ReadonlyArray<GroupingClusterCandidate> }): string {
	const clusterLines: Array<string> = []
	args.clusters.forEach((cluster, clusterIdx) => {
		clusterLines.push(`${clusterIdx + 1}. List "${cluster.listName}":`)
		cluster.items.forEach((item, itemIdx) => {
			clusterLines.push(`    ${clusterIdx + 1}.${itemIdx + 1} "${item.title}" (id=${item.itemId})`)
		})
	})

	return [
		'You are a wishlist hygiene assistant. The user has lists with several items that COULD potentially form a group. Your job is to decide whether each cluster is:',
		'',
		'- "or": the user almost certainly wants ONLY ONE of these. Alternates of the same need - different brands of the same product, different styles or colors of the same garment, two competing models of the same gadget.',
		'- "order": the user wants these in sequence. One item is a prerequisite or accessory for another - a console before its controllers, a camera body before lenses, a printer before its consumables.',
		'- "skip": the items are NOT a meaningful group. Distinct needs that happen to share a category go here. ALWAYS prefer "skip" if you are not confident.',
		'',
		'Bias toward "skip". Grouping locks claim semantics: claiming one "or" item locks the others, and "order" forces a purchase sequence. Wrong groups frustrate the recipient and the gifter, so only flag groups when the same person owning all of these items at once would feel redundant ("or") or pointless without the prerequisite ("order").',
		'',
		'For each suggestion, return:',
		'- clusterIndex: the 1-based number from the cluster list below.',
		'- decision: "or", "order", or "skip".',
		'- itemIds: the subset of item ids you want to include in the group. For "order", list them in the order they should be PURCHASED (prerequisite first). Omit ids that should not be part of the group. For "skip", return an empty array.',
		'- rationale: one sentence explaining your decision in plain language. Do not reference the cluster index or item ids in the rationale.',
		'',
		'NEVER mention gift claims, gifters, or who has purchased anything. You do not have that information.',
		'',
		'Clusters:',
		...clusterLines,
	].join('\n')
}
