import { z } from 'zod'

// Combined per-item facet extraction ("enrichment"). One batched call
// answers every stable per-item question the analyzers used to re-ask the
// model on every run: category, canonical product identity (for the
// duplicates analyzer), and the clothing size/color facets (for the
// clothing-prefs analyzer). Results persist in `item_ai_analysis` keyed by
// content hash, so an item is only re-analyzed when its title/notes/url
// change or ANALYSIS_VERSION is bumped.
//
// Spoiler-protection rule: the prompt sees ONLY item title/notes. Never
// claim data, never gifter identities.
//
// NOTE on schema constraints: OpenAI's structured-output validator rejects
// `maxItems` on arrays and `min`/`max` on strings. Keep these schemas
// shape-only; bound sizes post-parse in the enrichment runner.

export const enrichmentItemSchema = z.object({
	itemId: z.string(),
	category: z.string(),
	canonicalName: z.string(),
	isClothing: z.boolean(),
	hasSize: z.boolean(),
	hasColor: z.boolean(),
	// One-sentence "what's missing" note for clothing items; empty string
	// for non-clothing items. Surfaced verbatim as the muted detail line on
	// clothing-prefs sub-rows.
	sizingRationale: z.string(),
	suggestedSizes: z.array(z.string()),
	suggestedColors: z.array(z.string()),
})

export const enrichmentResponseSchema = z.object({
	items: z.array(enrichmentItemSchema),
})

export type EnrichmentResponse = z.infer<typeof enrichmentResponseSchema>

// Fixed taxonomy. Free-form categories would fragment ("lego" vs "legos"
// vs "building sets") and be useless for grouping/insights, so the model
// must pick from this list or 'other'.
export const ENRICHMENT_CATEGORIES = [
	'clothing',
	'shoes',
	'jewelry-accessories',
	'electronics',
	'toys-games',
	'books-media',
	'home-kitchen',
	'beauty-personal-care',
	'sports-outdoors',
	'food-drink',
	'arts-crafts',
	'baby-kids',
	'tools-garden',
	'pets',
	'gift-cards',
	'experiences',
	'other',
] as const

export const MAX_SUGGESTED_OPTIONS = 6

export type EnrichmentCandidate = {
	itemId: string
	title: string
	notes: string | null
}

// Stable instructions block. Identical across users and runs.
export const ENRICHMENT_SYSTEM = [
	"You are a wishlist catalog assistant. You receive items from a user's gift lists and extract stable facts about each one.",
	'',
	'For each item return:',
	`- category: exactly one of [${ENRICHMENT_CATEGORIES.join(', ')}]. Pick the closest fit; use 'other' when nothing fits.`,
	'- canonicalName: the normalized product identity in lowercase — brand plus product line/model, DROPPING size, color, quantity, and SKU-style disambiguators (e.g. "Nike Air Zoom Pegasus 40, Blue, Size 11" -> "nike air zoom pegasus 40"). Two items describing the same purchasable product should produce the same canonicalName.',
	'- isClothing: true when the item is clothing/shoes/apparel/accessories where SIZE or COLOR matters to a gifter (shirts, pants, shoes, hats, jackets, dresses, gloves, socks; NOT books, electronics, kitchenware, candles, plants).',
	'- hasSize: true when the title or notes already pin down a size the gifter would shop for. hasColor: likewise for color. Both false for non-clothing items.',
	'- sizingRationale: for clothing items where size or color is missing, one plain-language sentence saying what a gifter would still need to know. Empty string for non-clothing items or fully-specified clothing.',
	'- suggestedSizes / suggestedColors: for clothing items missing that preference, a small slate of generic options the user might mean — common adult sizes for the garment type, popular colorways. Do not invent SKU-specific options. Empty arrays otherwise.',
	'',
	'Echo each itemId back exactly as given. NEVER mention gift claims, gifters, recipients, or who has purchased anything. You do not have that information.',
	'',
	'Response shape: { items: [{ itemId, category, canonicalName, isClothing, hasSize, hasColor, sizingRationale, suggestedSizes, suggestedColors }, ...] }.',
].join('\n')

// Variable suffix: one line per item.
export function buildEnrichmentUserPrompt(args: { candidates: ReadonlyArray<EnrichmentCandidate> }): string {
	const lines = args.candidates.map(c => {
		const notes = c.notes ? c.notes.replace(/\s+/g, ' ').slice(0, 200) : ''
		return `  itemId=${c.itemId} title="${c.title}" notes="${notes}"`
	})
	return ['Items:', ...lines].join('\n')
}
