import { z } from 'zod'

// NOTE: keep these schemas shape-only, since OpenAI's structured-output
// validator rejects `maxItems` on arrays and `min`/`max` on strings.
// Bound the response with the prompt + a post-parse slice in the analyzer.
export const duplicatePairSchema = z.object({
	leftItemId: z.string(),
	rightItemId: z.string(),
	confident: z.boolean(),
	rationale: z.string(),
})

export const duplicatesResponseSchema = z.object({
	pairs: z.array(duplicatePairSchema),
})

export const DUPLICATES_MAX_PAIRS = 8

export type DuplicatesResponse = z.infer<typeof duplicatesResponseSchema>

export type DuplicateCandidate = {
	itemId: string
	title: string
	listId: string
	listName: string
	listType: string
}

export function buildDuplicatesPrompt(args: { candidatePairs: ReadonlyArray<[DuplicateCandidate, DuplicateCandidate]> }): string {
	const lines = args.candidatePairs.map(
		(pair, i) =>
			`${i + 1}. A: "${pair[0].title}" on "${pair[0].listName}" (id=${pair[0].itemId})\n    B: "${pair[1].title}" on "${pair[1].listName}" (id=${pair[1].itemId})`
	)
	return [
		'You are a list hygiene assistant. Each pair below contains two items the user owns that have similar titles or URLs.',
		'Decide which pairs are SEMANTICALLY the same product (different SKUs / colors / sizes do NOT count as duplicates - only flag if a gifter would reasonably buy the same thing twice).',
		'For each pair respond with the two ids, confident=true if you are sure it is a duplicate (only set true if you are confident), and a one-sentence rationale.',
		'NEVER mention gift claims, gifters, or who has purchased anything. You do not have that information.',
		'',
		'Pairs:',
		...lines,
	].join('\n')
}
