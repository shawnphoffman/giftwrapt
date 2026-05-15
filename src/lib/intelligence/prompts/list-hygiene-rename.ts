// Single-shot AI rename for the list-hygiene `convert-public-list`
// branch. The prompt sees ONLY the current list name, the target list
// type, the event title, and the event year. No item content, no claim
// data, no other-list context, no owner / partner / dependent name.
// Spoiler protection holds by construction at the prompt-input level,
// not by post-hoc filtering.
//
// Opt-in via `intelligenceListHygieneRenameWithAi`. Off by default. When
// off, the analyzer uses the existing deterministic regex
// `renameForConvert` verbatim. When on, the analyzer calls this prompt
// per branch-1 candidate (capped per-run), validates the response, and
// falls back to the regex name when validation fails or the AI provider
// is unavailable. The chosen name is baked into the rec at generation;
// `applyConvertList` never re-calls the AI.

import { z } from 'zod'

// Structured response shape. Keep it minimal — one string field — so
// the OpenAI structured-output validator (which rejects `min`/`max` on
// strings) doesn't trip. Bounds are enforced by `validateRenameResponse`
// after parsing.
export const listHygieneRenameResponseSchema = z.object({
	name: z.string(),
})

export type ListHygieneRenameResponse = z.infer<typeof listHygieneRenameResponseSchema>

// Per-run cap on AI calls within a single list-hygiene pass. Defends
// against pathological seed states (one user with dozens of public
// non-matching lists). Promoted to a setting only if operators ask.
export const LIST_HYGIENE_RENAME_AI_CAP = 5

// Words the model must never include in the proposed name. Belt-and-
// suspenders: the prompt forbids them too, but the validator is the
// load-bearing gate. Plurals + obvious inflections are listed
// explicitly so a slip like "presents" or "claims" doesn't get past
// the word-boundary regex.
const BANNED_NAME_TOKENS = [
	'gift',
	'gifts',
	'gifted',
	'gifting',
	'present',
	'presents',
	'claim',
	'claims',
	'claimed',
	'claiming',
	'purchase',
	'purchases',
	'purchased',
	'purchasing',
	'bought',
]

export type ListHygieneRenameInput = {
	currentName: string
	// The pretty type label (e.g. "birthday", "Christmas", "holiday").
	// Already user-facing copy; the analyzer passes
	// `prettyListType(newType)` here.
	newType: string
	eventTitle: string
	eventYear: number
}

export function buildListHygieneRenamePrompt(input: ListHygieneRenameInput): string {
	return [
		"You rename gift lists. You see ONE list's current name, the type it is being converted to,",
		'the event it is being shaped for, and the year. Return ONE concise replacement name (3-40 characters).',
		'',
		'Rules:',
		`- The new name MUST mention the event ("${input.eventTitle}") or the year (${input.eventYear}).`,
		'- If the current name carries a person\'s name (e.g. "Sam\'s Wishlist"), preserve the person\'s name and rebuild around the event (e.g. "Sam\'s Birthday 2026").',
		'- If the current name is generic ("My List", "Wishlist", "Untitled"), produce "<EventTitle> <Year>" exactly.',
		'- NEVER include item descriptions. You do not know what is on the list.',
		'- NEVER include the words: gift, gifts, present, presents, claim, claimed, purchase, purchased, bought. You do not know anything about claims.',
		'- One line only.',
		'',
		'Inputs:',
		`Current name: ${input.currentName}`,
		`New type: ${input.newType}`,
		`Event: ${input.eventTitle}`,
		`Year: ${input.eventYear}`,
	].join('\n')
}

export type ValidateRenameArgs = {
	eventTitle: string
	eventYear: number
}

// Returns the cleaned proposed name when the model response passes
// every check, or `null` when the analyzer should fall back to the
// deterministic regex rename. Callers MUST treat `null` as "use the
// regex name" and record a `rename-fallback-validation` run-step.
export function validateRenameResponse(parsed: unknown, args: ValidateRenameArgs): string | null {
	const ok = listHygieneRenameResponseSchema.safeParse(parsed)
	if (!ok.success) return null
	const raw = ok.data.name
	if (typeof raw !== 'string') return null
	// Multi-line responses are rejected outright — the prompt asks for
	// "one line only" so anything richer is the model ignoring the rule.
	// Check BEFORE the whitespace-collapse below, which would otherwise
	// fold the newline into a regular space.
	if (raw.includes('\n') || raw.includes('\r')) return null
	// Trim + collapse remaining whitespace; reject leading punctuation
	// defensively so we don't ship a name like ".Birthday 2026".
	const trimmed = raw.replace(/\s+/g, ' ').trim()
	if (trimmed.length < 3 || trimmed.length > 40) return null
	if (/^[^\w"'(]/.test(trimmed)) return null
	const lower = trimmed.toLowerCase()
	for (const banned of BANNED_NAME_TOKENS) {
		// Word-boundary so "presented" / "purchaser" wouldn't slip past
		// (theoretically irrelevant since the banned set is intentional
		// gift-domain vocabulary, but use word boundaries anyway).
		const re = new RegExp(`\\b${banned}\\b`, 'i')
		if (re.test(lower)) return null
	}
	// Must contain the event title (case-insensitive substring) or the
	// year string. Either is acceptable; the prompt rule above asks for
	// at least one. Year is matched as a bare 4-digit substring.
	const titleNeedle = args.eventTitle.toLowerCase()
	const yearNeedle = String(args.eventYear)
	if (!lower.includes(titleNeedle) && !lower.includes(yearNeedle)) return null
	return trimmed
}
