// The registry of AI features: what each one is, which setting turns it
// on, and exactly what it sends to the AI provider. Browser-safe.
//
// This is the single source for the admin AI page's toggles and their
// "what is sent" disclosure. A new AI feature adds an entry here in the
// same change that adds its model call; `ai-features.test.ts` fails when
// an AI toggle in the settings schema has no entry, and when a feature
// label used on the usage ledger has no entry.
//
// Write `sent` and `neverSent` from what the code does, not from intent.
// If a prompt changes, this changes with it.

import type { AppSettings } from '@/lib/settings'

type BooleanSettingKey = { [K in keyof AppSettings]: AppSettings[K] extends boolean ? K : never }[keyof AppSettings]

export type AiFeatureInfo = {
	// Matches the `feature` label on `ai_usage` rows (AiFeature in ai-call.ts).
	id: string
	label: string
	description: string
	// The app setting that turns the feature on. Null when it is switched
	// somewhere else (see `managedAt`).
	settingKey: BooleanSettingKey | null
	// Where the feature is configured in more depth, or switched when
	// `settingKey` is null.
	managedAt?: { href: string; label: string }
	sent: ReadonlyArray<string>
	neverSent: ReadonlyArray<string>
}

const NOTHING_ABOUT_PEOPLE = 'Anything about your users, their lists, or their gifts'

export const AI_FEATURE_REGISTRY: ReadonlyArray<AiFeatureInfo> = [
	{
		id: 'scrape-provider',
		label: 'AI Scraper',
		description: 'Reads a product page with the AI model when it is one of the configured scrape providers.',
		settingKey: null,
		managedAt: { href: '/admin/scraping', label: 'Scraping' },
		sent: ['The product page URL being added', 'The text and markup of that page, with scripts and styles removed (up to 32 KB)'],
		neverSent: [NOTHING_ABOUT_PEOPLE],
	},
	{
		id: 'clean-title',
		label: 'Clean Imported Titles',
		description: 'A small pass after a scrape that strips retailer noise from the title.',
		settingKey: 'scrapeAiCleanTitlesEnabled',
		sent: ['The scraped title', 'The product page URL', 'The store name, when known'],
		neverSent: [NOTHING_ABOUT_PEOPLE],
	},
	{
		id: 'photo-extract',
		label: 'Photo to Item',
		description: 'Fills in a new item from a photo the user uploads.',
		settingKey: 'aiPhotoExtractEnabled',
		sent: ['The uploaded photo'],
		neverSent: [NOTHING_ABOUT_PEOPLE],
	},
	{
		id: 'paste-to-items',
		label: 'Paste Text to Items',
		description:
			'An import option that turns pasted text (a notes-app list, a forwarded message) into items. The user reviews the result before anything is added.',
		settingKey: 'aiPasteToItemsEnabled',
		sent: ['The text the user pasted (up to 8,000 characters)'],
		neverSent: [NOTHING_ABOUT_PEOPLE],
	},
	{
		id: 'thank-you-draft',
		label: 'Thank-You Note Drafts',
		description:
			'A “Draft a Thank-You” button on the Received page. It writes a short note the user can edit and copy. Nothing is sent to anyone by the app.',
		settingKey: 'aiThankYouDraftsEnabled',
		sent: [
			'The first name of the user writing the note',
			'The first names of the people who gave the gifts',
			'The titles of the gifts, which have already been revealed to that user',
			'The name of the pet or baby, when the gifts were for a dependent',
		],
		neverSent: ['What anything cost, and gift notes', 'Gifts that have not been revealed yet', 'Last names and email addresses'],
	},
	{
		id: 'gift-suggestions',
		label: 'Gift Suggestions',
		description:
			'Adds a Need ideas? button to other people’s lists. It asks for a budget, then shows new gift ideas based on that person’s lists, each of which can be saved to the user’s private Gift Ideas or added to the list as an off-list gift. The AI runs only when a user asks, and never for a child account. Off removes the button.',
		settingKey: 'aiGiftSuggestionsEnabled',
		sent: [
			'The first name of the person the gift is for',
			'Titles, prices, priorities, and categories of the items on that person’s lists that the user asking can already see',
			'For each of those items, whether it is already claimed (yes or no only)',
			'The asking user’s own private gift ideas for that person, and the titles of gifts they already gave them',
			'The occasion, taken from the type of list being viewed (a Christmas list, a birthday list, a holiday list)',
			'The budget, when the user gives one',
		],
		neverSent: [
			'Who claimed anything, what anyone paid, and claim notes',
			'Item notes, links, and images',
			'Items the asking user cannot see, including anything hidden from a restricted viewer',
			'Other people’s gift ideas, off-list gifts, and comments',
			'Last names, email addresses, and birth dates',
		],
	},
	{
		id: 'intelligence',
		label: 'Suggestions',
		description:
			'Scheduled suggestions for each user about their own lists: stale items, duplicates, grouping, and set-up nudges. Users see the Suggestions page and can refresh it.',
		settingKey: 'intelligenceEnabled',
		managedAt: { href: '/admin/intelligence', label: 'Intelligence' },
		sent: [
			'Titles and notes of the items on the user’s own lists',
			'The names and types of those lists, and when each item was last changed',
			'Whether an item is marked unavailable, and the item groups already on the list',
		],
		neverSent: [
			'Claims: who is giving what, costs, and gift notes',
			'Gift-ideas lists (private notes about other people)',
			'Items already revealed or deleted',
			'Profile details: names, email addresses, and birthdays (a name typed into a list name or an item is sent as written)',
		],
	},
]

// Features on the ledger that are not user-facing toggles.
export const AI_LEDGER_ONLY_FEATURES: Readonly<Partial<Record<string, string>>> = {
	'admin-test': 'Connection Test',
}

// Settings that match the AI-toggle naming but are not a feature of their
// own, with the reason.
export const AI_NON_FEATURE_SETTINGS: Readonly<Record<string, string>> = {
	scrapeAiProviderEnabled: 'Legacy toggle, migrated into a scrapeProviders entry at bootstrap; the scrape-provider entry covers it.',
	intelligenceEmailEnabled: 'Gates the operator digest email, which makes no model call.',
	intelligenceEmailWeeklyDigestEnabled: 'Gates the operator digest email, which makes no model call.',
	intelligenceListHygieneRenameWithAi: 'A sub-option of Suggestions, configured on the Intelligence page.',
}

export function aiFeatureLabel(id: string): string {
	return AI_FEATURE_REGISTRY.find(f => f.id === id)?.label ?? AI_LEDGER_ONLY_FEATURES[id] ?? id
}

// How a call's `source` reads on the admin usage card.
const AI_SOURCE_LABELS: Readonly<Partial<Record<string, string>>> = {
	web: 'Web App',
	mcp: 'AI Assistant (MCP)',
	mobile: 'Mobile App',
	import: 'Import Queue',
	cron: 'Scheduled Job',
	admin: 'Admin',
	cli: 'Command Line',
}

export function aiSourceLabel(source: string | null): string {
	if (source === null) return 'Unknown'
	return AI_SOURCE_LABELS[source] ?? source
}

// The shape written to catalogs/ai-features.json by `pnpm docs:catalogs`. The docs site renders its "What Each
// Feature Sends" table from that file, so the public page cannot drift
// from this registry.
export type AiFeatureCatalogEntry = {
	id: string
	label: string
	description: string
	settingKey: string | null
	managedAt: string | null
	sent: ReadonlyArray<string>
	neverSent: ReadonlyArray<string>
}

export function buildAiFeaturesCatalog(): Array<AiFeatureCatalogEntry> {
	return AI_FEATURE_REGISTRY.map(f => ({
		id: f.id,
		label: f.label,
		description: f.description,
		settingKey: f.settingKey,
		managedAt: f.managedAt?.label ?? null,
		sent: f.sent,
		neverSent: f.neverSent,
	}))
}
