// Single source of truth for free-text length caps. Schemas (zod) and
// inputs (HTML maxLength) both reference these so a bump only needs to
// happen in one place. Numbers are picked to be flexible-but-not-abusive,
// not as security boundaries.
export const LIMITS = {
	// Machine identifiers (provider entry id, etc.).
	SHORT_ID: 64,
	// Display names: scraper provider name, group name, model name,
	// fromName, profile name. Tight on purpose because these surface in
	// dialog headers and other small UI chrome.
	SHORT_NAME: 60,
	// RFC 5321 addr-spec cap for email addresses.
	EMAIL: 254,
	PRICE: 50,
	CURRENCY: 10,
	LIST_NAME: 200,
	ITEM_TITLE: 500,
	URL: 2000,
	// Short free text (addon description).
	SHORT_TEXT: 500,
	// Medium free text: list description, claim notes, addon notes,
	// AI prompts / instructions.
	MEDIUM_TEXT: 2000,
	// Long markdown free text: item notes, comments.
	LONG_TEXT: 5000,
	// Custom-HTTP headers JSON blob.
	HEADERS_JSON: 4000,
	// API keys / tokens.
	SECRET: 500,
	// Bcrypt's input ceiling is 72 bytes; cap higher than that for UX
	// but low enough to prevent DoS via pathological inputs.
	PASSWORD: 256,
} as const

export type LimitKey = keyof typeof LIMITS
