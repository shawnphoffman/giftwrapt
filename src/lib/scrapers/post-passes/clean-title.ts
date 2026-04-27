import { generateText } from 'ai'

import type { Database } from '@/db'
import { createAiModel } from '@/lib/ai-client'
import { resolveAiConfig } from '@/lib/ai-config'
import { getAppSettings } from '@/lib/settings-loader'

import type { ScrapeResult } from '../types'

// Post-pass that runs after the orchestrator picks a winning result. Asks
// the configured LLM to normalise the title — strip retailer noise, brand
// prefixes, "| Free Shipping" suffixes, etc. The original title is kept
// alongside so we can show both / revert / diagnose.
//
// Gated on:
//   1. scrapeAiCleanTitlesEnabled (admin toggle)
//   2. resolveAiConfig(db).isValid
//
// Off by default. Independent of which provider produced the winning
// title. Costs a small token bill per scrape when enabled.

const SYSTEM_PROMPT = `You normalise noisy retailer product titles into a clean, human-readable name.

Rules:
- Strip retailer / marketplace noise: "Amazon.com:", "| Best Seller", "| Free Shipping", "(Pack of 2) -" if not load-bearing, etc.
- Keep model numbers, sizes, colours, and pack counts when they're meaningful.
- Do NOT translate, embellish, or invent.
- Return a single line, no quotation marks, no surrounding whitespace.
- If the title already looks clean, return it unchanged.`

export type CleanTitleOptions = {
	url?: string
	vendorId?: string | null
	signal?: AbortSignal
}

export type CleanTitleOutcome = {
	cleaned?: string
	skipped?: 'toggle_off' | 'config_invalid' | 'no_title'
	error?: string
}

// Returns a possibly-cleaned title plus a structured outcome. Never throws -
// the caller treats failures as "use the original title". This keeps a flaky
// AI provider from blowing up an otherwise-successful scrape.
export async function maybeCleanTitle(db: Database, result: ScrapeResult, options: CleanTitleOptions = {}): Promise<CleanTitleOutcome> {
	if (!result.title || !result.title.trim()) {
		return { skipped: 'no_title' }
	}

	const settings = await getAppSettings(db)
	if (!settings.scrapeAiCleanTitlesEnabled) {
		return { skipped: 'toggle_off' }
	}

	const aiConfig = await resolveAiConfig(db)
	if (!aiConfig.isValid) {
		return { skipped: 'config_invalid' }
	}

	const model = createAiModel({
		providerType: aiConfig.providerType.value!,
		apiKey: aiConfig.apiKey.value!,
		model: aiConfig.model.value!,
		baseUrl: aiConfig.baseUrl.value,
	})

	const promptParts: Array<string> = [`Title: ${result.title}`]
	if (options.url) promptParts.push(`URL: ${options.url}`)
	if (options.vendorId) promptParts.push(`Vendor: ${options.vendorId}`)

	try {
		const { text } = await generateText({
			model,
			abortSignal: options.signal,
			system: SYSTEM_PROMPT,
			prompt: promptParts.join('\n'),
		})
		const cleaned = text.trim().replace(/^["'`]|["'`]$/g, '')
		if (!cleaned) return { skipped: 'no_title' }
		return { cleaned }
	} catch (err) {
		return { error: err instanceof Error ? err.message : String(err) }
	}
}
