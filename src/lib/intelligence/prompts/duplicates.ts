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

// Stable instructions that never vary across users or runs. Kept long
// enough to clear the Anthropic 1024-token cache threshold and pinned
// at the top of the messages array so prompt caching wins on every
// subsequent call within the TTL window.
export const DUPLICATES_SYSTEM = [
	'You are a list hygiene assistant. You receive PAIRS of items the user owns whose titles look similar, and decide which are SEMANTICALLY the same product.',
	'',
	'Rules:',
	'- Different SKUs, colors, sizes, or storage capacities do NOT count as duplicates. Only flag a pair when a gifter would reasonably buy the same product twice by mistake.',
	'- Set `confident=true` ONLY when you are sure. Ambiguous pairs should come back with `confident=false` and a one-sentence rationale that explains your uncertainty.',
	'- Echo the item ids back exactly as given.',
	'- One sentence per rationale, plain language, no list jargon.',
	'- NEVER mention gift claims, gifters, recipients, or who has purchased anything. You do not have that information.',
	'',
	'Response shape: { pairs: [{ leftItemId, rightItemId, confident, rationale }, ...] }.',
].join('\n')

// Variable suffix: just the candidate pairs. Kept lean so it doesn't
// blow past the cache prefix.
export function buildDuplicatesUserPrompt(args: { candidatePairs: ReadonlyArray<[DuplicateCandidate, DuplicateCandidate]> }): string {
	const lines = args.candidatePairs.map(
		(pair, i) =>
			`${i + 1}. A: "${pair[0].title}" on "${pair[0].listName}" (id=${pair[0].itemId})\n    B: "${pair[1].title}" on "${pair[1].listName}" (id=${pair[1].itemId})`
	)
	return ['Pairs:', ...lines].join('\n')
}

// Legacy single-string builder. Kept as a thin combinator so any
// out-of-band caller (debug scripts, tests reading the legacy shape)
// still gets the same text. New callers should use the system/user
// split above.
export function buildDuplicatesPrompt(args: { candidatePairs: ReadonlyArray<[DuplicateCandidate, DuplicateCandidate]> }): string {
	return `${DUPLICATES_SYSTEM}\n\n${buildDuplicatesUserPrompt(args)}`
}
