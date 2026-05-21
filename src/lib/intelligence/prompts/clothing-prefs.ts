import { z } from 'zod'

// Asks the model to (a) decide which candidate items are clothing and
// (b) for those clothing items where the title doesn't already encode a
// specific size/color, generate a short headline + suggested options to
// nudge the user to record their preference. Bounds enforced post-parse
// since OpenAI's structured-output validator rejects array max-length.
export const clothingPrefsItemSchema = z.object({
	itemId: z.string(),
	include: z.boolean(),
	hasSize: z.boolean(),
	hasColor: z.boolean(),
	headline: z.string(),
	rationale: z.string(),
	// Suggested options the gifter would likely look for. We surface these
	// as part of the rationale so the user has concrete starting points.
	suggestedSizes: z.array(z.string()),
	suggestedColors: z.array(z.string()),
})

export const clothingPrefsResponseSchema = z.object({
	items: z.array(clothingPrefsItemSchema),
})

export const CLOTHING_PREFS_MAX_RECS = 12
export const CLOTHING_PREFS_MAX_OPTIONS = 6

export type ClothingPrefsResponse = z.infer<typeof clothingPrefsResponseSchema>

export type ClothingPrefsCandidate = {
	itemId: string
	title: string
	notes: string | null
	listName: string
	listType: string
}

// Stable instructions block. Identical across users and runs.
export const CLOTHING_PREFS_SYSTEM = [
	'You are a wishlist hygiene assistant. You receive items the user owns. Some are clothing/shoes/apparel/accessories; many are not.',
	'',
	'For each item:',
	'- Decide if it is clothing/shoes/apparel/accessories where SIZE or COLOR matters to a gifter (e.g. shirts, pants, shoes, hats, jackets, dresses, gloves, socks; NOT books, electronics, kitchenware, candles, plants).',
	'- If the title or notes already pins down BOTH a size AND a color the gifter would shop for, set include=false (the user already recorded the preference).',
	'- For items you DO include, write a headline of the form `Add size and color to <title>` (or just size, or just color, depending on what is missing) and a one-sentence rationale.',
	'- Also suggest a small slate of specific options the user might mean - common adult sizes for the garment type, popular colorways for that product. Do not invent SKU-specific options; keep them generic.',
	'- Set hasSize=true when the title/notes already includes a size; hasColor=true when the title/notes already includes a color. If both are true, include=false.',
	'',
	'NEVER mention gift claims, gifters, recipients, or who has purchased anything. You do not have that information.',
	'',
	'Response shape: { items: [{ itemId, include, hasSize, hasColor, headline, rationale, suggestedSizes, suggestedColors }, ...] }.',
].join('\n')

// Variable suffix.
export function buildClothingPrefsUserPrompt(args: { candidates: ReadonlyArray<ClothingPrefsCandidate> }): string {
	const lines = args.candidates.map(c => {
		const notes = c.notes ? c.notes.replace(/\s+/g, ' ').slice(0, 200) : ''
		return `  itemId=${c.itemId} title="${c.title}" notes="${notes}" list="${c.listName}"`
	})
	return ['Items:', ...lines].join('\n')
}

// Legacy single-string builder for backwards-compatible callers.
export function buildClothingPrefsPrompt(args: { candidates: ReadonlyArray<ClothingPrefsCandidate> }): string {
	return `${CLOTHING_PREFS_SYSTEM}\n\n${buildClothingPrefsUserPrompt(args)}`
}
