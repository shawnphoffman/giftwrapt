// Model slots: which kind of model a feature runs on. Browser-safe.
//
// `default` is the provider and model on the admin AI page. `fast` and
// `vision` are optional; an empty slot resolves to `default` (see
// `resolveAiConfig` in ai-config.ts), so a deployment that sets neither
// behaves as if slots did not exist.
//
// The mapping is fixed here on purpose: an admin picks a model per slot,
// not per feature. A new AI feature adds its label below in the same
// change that adds it to `AI_FEATURES`; the `Record` type fails the build
// until it does.

import type { Locale } from '@/lib/i18n/locales'
import { m } from '@/paraglide/messages.js'

import type { AiFeature } from './ai-call'

export const AI_SLOTS = ['default', 'fast', 'vision'] as const
export type AiSlot = (typeof AI_SLOTS)[number]

// The slots an admin can fill in separately from the main config.
export const AI_EXTRA_SLOTS = ['fast', 'vision'] as const
export type AiExtraSlot = (typeof AI_EXTRA_SLOTS)[number]

// A slot's name as an admin reads it. Screens call it with no options and
// get the language of the page; anything that must stay English (the docs
// catalog) passes `{ locale: 'en' }`.
export function aiSlotLabel(slot: AiSlot, options?: { locale?: Locale }): string {
	switch (slot) {
		case 'default':
			return m.admin_ai_slot_name_default({}, options)
		case 'fast':
			return m.admin_ai_slot_name_fast({}, options)
		case 'vision':
			return m.admin_ai_slot_name_vision({}, options)
	}
}

export const AI_FEATURE_SLOTS: Record<AiFeature, AiSlot> = {
	// Runs only after the cheaper scrape tiers failed, so it sees the hard
	// pages. A wrong price costs more than the tokens a small model saves.
	'scrape-provider': 'default',
	'clean-title': 'fast',
	'photo-extract': 'vision',
	// Sends the provider's title, brand and the code. No image.
	'barcode-identify': 'fast',
	// Intelligence picks per analyzer; see INTELLIGENCE_ANALYZER_SLOTS.
	intelligence: 'default',
	'gift-suggestions': 'default',
	'paste-to-items': 'fast',
	'thank-you-draft': 'default',
	// Sorting titles into a few buckets is mechanical.
	'category-suggestions': 'fast',
	// The connection test names the slot it is testing.
	'admin-test': 'default',
}

// Intelligence analyzers that are mechanical enough for the fast slot.
// Anything not listed runs on `default`. 'enrichment' is the pre-step's
// pseudo-analyzer id.
export const INTELLIGENCE_ANALYZER_SLOTS: Readonly<Record<string, AiSlot | undefined>> = {
	enrichment: 'fast',
	duplicates: 'fast',
	'stale-items': 'fast',
}

export function slotForAnalyzer(analyzerId: string): AiSlot {
	return INTELLIGENCE_ANALYZER_SLOTS[analyzerId] ?? 'default'
}

// Every slot a feature can run on, for the admin page and the docs
// catalog. Intelligence is the one feature that spans two.
export function slotsForFeature(feature: AiFeature): ReadonlyArray<AiSlot> {
	if (feature === 'intelligence') return ['default', 'fast']
	return [AI_FEATURE_SLOTS[feature]]
}
