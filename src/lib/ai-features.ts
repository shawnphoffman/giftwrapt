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
// If a prompt changes, this changes with it. The wording lives in the
// message catalog (`admin_ai_feature_*` in messages/en/admin-settings.json).

import type { AiFeature } from '@/lib/ai-call'
import { type AiSlot, aiSlotLabel, slotsForFeature } from '@/lib/ai-slots'
import type { Locale } from '@/lib/i18n/locales'
import type { AppSettings } from '@/lib/settings'
import { m } from '@/paraglide/messages.js'

type BooleanSettingKey = { [K in keyof AppSettings]: AppSettings[K] extends boolean ? K : never }[keyof AppSettings]

// Text from the message catalog, rendered when it is called: with no
// options, in the language of the page; with `{ locale: 'en' }`, in English
// for output that must not follow the reader (the docs catalog). Never call
// one when a module loads.
type MessageOptions = { locale?: Locale }
export type AiFeatureText = (options?: MessageOptions) => string

export type AiFeatureInfo = {
	// Matches the `feature` label on `ai_usage` rows (AiFeature in ai-call.ts).
	id: string
	label: AiFeatureText
	description: AiFeatureText
	// The app setting that turns the feature on. Null when it is switched
	// somewhere else (see `managedAt`).
	settingKey: BooleanSettingKey | null
	// Where the feature is configured in more depth, or switched when
	// `settingKey` is null.
	managedAt?: { href: string; label: AiFeatureText }
	sent: ReadonlyArray<AiFeatureText>
	neverSent: ReadonlyArray<AiFeatureText>
	// The model slots the feature runs on (plan 34). Filled in from
	// src/lib/ai-slots.ts, which is where the mapping is decided.
	slots: ReadonlyArray<AiSlot>
}

const NOTHING_ABOUT_PEOPLE: AiFeatureText = o => m.admin_ai_feature_never_nothing_about_people({}, o)

const REGISTRY_ENTRIES: ReadonlyArray<Omit<AiFeatureInfo, 'slots'>> = [
	{
		id: 'scrape-provider',
		label: o => m.admin_ai_feature_scrape_provider_label({}, o),
		description: o => m.admin_ai_feature_scrape_provider_description({}, o),
		settingKey: null,
		managedAt: { href: '/admin/scraping', label: o => m.admin_ai_feature_managed_scraping({}, o) },
		sent: [
			o => m.admin_ai_feature_scrape_provider_sent_page_url({}, o),
			o => m.admin_ai_feature_scrape_provider_sent_page_content({}, o),
			o => m.admin_ai_feature_scrape_provider_sent_web_fetch({}, o),
		],
		neverSent: [NOTHING_ABOUT_PEOPLE],
	},
	{
		id: 'clean-title',
		label: o => m.admin_ai_feature_clean_title_label({}, o),
		description: o => m.admin_ai_feature_clean_title_description({}, o),
		settingKey: 'scrapeAiCleanTitlesEnabled',
		sent: [
			o => m.admin_ai_feature_clean_title_sent_title({}, o),
			o => m.admin_ai_feature_clean_title_sent_page_url({}, o),
			o => m.admin_ai_feature_clean_title_sent_store_name({}, o),
		],
		neverSent: [NOTHING_ABOUT_PEOPLE],
	},
	{
		id: 'photo-extract',
		label: o => m.admin_ai_feature_photo_extract_label({}, o),
		description: o => m.admin_ai_feature_photo_extract_description({}, o),
		settingKey: 'aiPhotoExtractEnabled',
		sent: [o => m.admin_ai_feature_photo_extract_sent_photo({}, o), o => m.admin_ai_feature_photo_extract_sent_barcode({}, o)],
		neverSent: [NOTHING_ABOUT_PEOPLE],
	},
	{
		id: 'barcode-identify',
		label: o => m.admin_ai_feature_barcode_identify_label({}, o),
		description: o => m.admin_ai_feature_barcode_identify_description({}, o),
		settingKey: 'aiBarcodeIdentifyEnabled',
		managedAt: { href: '/admin/barcode', label: o => m.admin_ai_feature_managed_barcode({}, o) },
		sent: [
			o => m.admin_ai_feature_barcode_identify_sent_provider_result({}, o),
			o => m.admin_ai_feature_barcode_identify_sent_barcode({}, o),
		],
		neverSent: [NOTHING_ABOUT_PEOPLE],
	},
	{
		id: 'paste-to-items',
		label: o => m.admin_ai_feature_paste_to_items_label({}, o),
		description: o => m.admin_ai_feature_paste_to_items_description({}, o),
		settingKey: 'aiPasteToItemsEnabled',
		sent: [o => m.admin_ai_feature_paste_to_items_sent_pasted_text({}, o)],
		neverSent: [NOTHING_ABOUT_PEOPLE],
	},
	{
		id: 'thank-you-draft',
		label: o => m.admin_ai_feature_thank_you_draft_label({}, o),
		description: o => m.admin_ai_feature_thank_you_draft_description({}, o),
		settingKey: 'aiThankYouDraftsEnabled',
		sent: [
			o => m.admin_ai_feature_thank_you_draft_sent_writer_name({}, o),
			o => m.admin_ai_feature_thank_you_draft_sent_giver_names({}, o),
			o => m.admin_ai_feature_thank_you_draft_sent_gift_titles({}, o),
			o => m.admin_ai_feature_thank_you_draft_sent_dependent_name({}, o),
		],
		neverSent: [
			o => m.admin_ai_feature_thank_you_draft_never_costs_notes({}, o),
			o => m.admin_ai_feature_thank_you_draft_never_unrevealed({}, o),
			o => m.admin_ai_feature_thank_you_draft_never_contact({}, o),
		],
	},
	{
		id: 'category-suggestions',
		label: o => m.admin_ai_feature_category_suggestions_label({}, o),
		description: o => m.admin_ai_feature_category_suggestions_description({}, o),
		settingKey: 'aiCategorySuggestionsEnabled',
		sent: [
			o => m.admin_ai_feature_category_suggestions_sent_titles({}, o),
			o => m.admin_ai_feature_category_suggestions_sent_existing({}, o),
			o => m.admin_ai_feature_category_suggestions_sent_basic({}, o),
		],
		neverSent: [
			o => m.admin_ai_feature_category_suggestions_never_claims({}, o),
			o => m.admin_ai_feature_category_suggestions_never_details({}, o),
			o => m.admin_ai_feature_category_suggestions_never_people({}, o),
		],
	},
	{
		id: 'gift-suggestions',
		label: o => m.admin_ai_feature_gift_suggestions_label({}, o),
		description: o => m.admin_ai_feature_gift_suggestions_description({}, o),
		settingKey: 'aiGiftSuggestionsEnabled',
		sent: [
			o => m.admin_ai_feature_gift_suggestions_sent_recipient_name({}, o),
			o => m.admin_ai_feature_gift_suggestions_sent_visible_items({}, o),
			o => m.admin_ai_feature_gift_suggestions_sent_claimed_flag({}, o),
			o => m.admin_ai_feature_gift_suggestions_sent_own_ideas({}, o),
			o => m.admin_ai_feature_gift_suggestions_sent_occasion({}, o),
			o => m.admin_ai_feature_gift_suggestions_sent_budget({}, o),
			o => m.admin_ai_feature_gift_suggestions_sent_received({}, o),
			o => m.admin_ai_feature_gift_suggestions_sent_removed({}, o),
			o => m.admin_ai_feature_gift_suggestions_sent_already_has({}, o),
			o => m.admin_ai_feature_gift_suggestions_sent_not_for_them({}, o),
		],
		neverSent: [
			o => m.admin_ai_feature_gift_suggestions_never_claims({}, o),
			o => m.admin_ai_feature_gift_suggestions_never_item_details({}, o),
			o => m.admin_ai_feature_gift_suggestions_never_hidden_items({}, o),
			o => m.admin_ai_feature_gift_suggestions_never_others_ideas({}, o),
			o => m.admin_ai_feature_gift_suggestions_never_contact({}, o),
		],
	},
	{
		id: 'intelligence',
		label: o => m.admin_ai_feature_intelligence_label({}, o),
		description: o => m.admin_ai_feature_intelligence_description({}, o),
		settingKey: 'intelligenceEnabled',
		managedAt: { href: '/admin/intelligence', label: o => m.admin_ai_feature_managed_intelligence({}, o) },
		sent: [
			o => m.admin_ai_feature_intelligence_sent_items({}, o),
			o => m.admin_ai_feature_intelligence_sent_lists({}, o),
			o => m.admin_ai_feature_intelligence_sent_state({}, o),
		],
		neverSent: [
			o => m.admin_ai_feature_intelligence_never_claims({}, o),
			o => m.admin_ai_feature_intelligence_never_gift_ideas({}, o),
			o => m.admin_ai_feature_intelligence_never_gone_items({}, o),
			o => m.admin_ai_feature_intelligence_never_profile({}, o),
		],
	},
]

export const AI_FEATURE_REGISTRY: ReadonlyArray<AiFeatureInfo> = REGISTRY_ENTRIES.map(entry => ({
	...entry,
	slots: slotsForFeature(entry.id as AiFeature),
}))

// Features on the ledger that are not user-facing toggles.
export const AI_LEDGER_ONLY_FEATURES: Readonly<Partial<Record<string, AiFeatureText>>> = {
	'admin-test': o => m.admin_ai_feature_admin_test_label({}, o),
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
	return AI_FEATURE_REGISTRY.find(f => f.id === id)?.label() ?? AI_LEDGER_ONLY_FEATURES[id]?.() ?? id
}

// How a call's `source` reads on the admin usage card.
const AI_SOURCE_LABELS: Readonly<Partial<Record<string, AiFeatureText>>> = {
	web: o => m.admin_ai_feature_source_web({}, o),
	mcp: o => m.admin_ai_feature_source_mcp({}, o),
	mobile: o => m.admin_ai_feature_source_mobile({}, o),
	import: o => m.admin_ai_feature_source_import({}, o),
	cron: o => m.admin_ai_feature_source_cron({}, o),
	admin: o => m.admin_ai_feature_source_admin({}, o),
	cli: o => m.admin_ai_feature_source_cli({}, o),
}

export function aiSourceLabel(source: string | null): string {
	if (source === null) return m.admin_ai_feature_source_unknown()
	return AI_SOURCE_LABELS[source]?.() ?? source
}

// The shape written to catalogs/ai-features.json by `pnpm docs:catalogs`. The docs site renders its "What Each
// Feature Sends" table from that file, so the public page cannot drift
// from this registry. The docs are English, so every text here is rendered
// in English whatever language the caller is in.
export type AiFeatureCatalogEntry = {
	id: string
	label: string
	description: string
	settingKey: string | null
	managedAt: string | null
	sent: ReadonlyArray<string>
	neverSent: ReadonlyArray<string>
	// Labels of the model slots the feature runs on ("Default", "Fast", "Vision").
	slots: ReadonlyArray<string>
}

const DOCS_LOCALE: MessageOptions = { locale: 'en' }

export function buildAiFeaturesCatalog(): Array<AiFeatureCatalogEntry> {
	return AI_FEATURE_REGISTRY.map(f => ({
		id: f.id,
		label: f.label(DOCS_LOCALE),
		description: f.description(DOCS_LOCALE),
		settingKey: f.settingKey,
		managedAt: f.managedAt?.label(DOCS_LOCALE) ?? null,
		sent: f.sent.map(line => line(DOCS_LOCALE)),
		neverSent: f.neverSent.map(line => line(DOCS_LOCALE)),
		slots: f.slots.map(s => aiSlotLabel(s, DOCS_LOCALE)),
	}))
}
