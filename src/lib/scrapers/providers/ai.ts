import { generateObject } from 'ai'

import { db } from '@/db'
import { createAiModel } from '@/lib/ai-client'
import { resolveAiConfig } from '@/lib/ai-config'
import type { AiEntry } from '@/lib/settings'

import { looksLikeBlocked } from '../bot-detect'
import { safeFetch } from '../safe-fetch'
import { type ProviderResponse, type ScrapeContext, type ScrapeProvider, scrapeResultSchema } from '../types'
import { ScrapeProviderError } from '../types'

// AI extractor provider. Does its own lightweight fetch of the URL
// (browser UA, single attempt, smaller body cap than fetch-provider to
// keep token counts reasonable), then asks the configured LLM to extract
// a ScrapeResult against the zod schema. Returns a StructuredResponse so
// the orchestrator skips the local extractor.
//
// Each entry in `appSettings.scrapeProviders` of type `'ai'` becomes its
// own provider. LLM credentials (provider type / key / model) are
// inherited from the app's AI config under /admin/ai-settings; the entry
// itself only carries admin-managed metadata (name, enabled, tier).
//
// Gated on:
//   1. entry.enabled
//   2. resolveAiConfig(db).isValid (a provider is actually configured)
//
// Off by default. Costs money per scrape. Bypasses bot-walled sites only
// to the extent that the LLM-driven extraction can salvage anything from
// a partial fetch; not a CAPTCHA solver.

const PROVIDER_TYPE = 'ai'

// Keep token costs bounded. ~50KB of HTML is plenty for any retailer page
// to surface OG tags / product structure to the LLM.
const MAX_HTML_BYTES = 50_000

const AI_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36'

const SYSTEM_PROMPT = `You are an HTML product information extractor. Given the HTML content of a single web page, extract structured data about the primary item being sold or described. Return only fields you can confidently identify; leave fields blank when unsure. Do not invent values.`

export function aiProviderId(entryId: string): string {
	return `${PROVIDER_TYPE}:${entryId}`
}

export function createAiProvider(entry: AiEntry): ScrapeProvider {
	const providerId = aiProviderId(entry.id)
	return {
		id: providerId,
		name: entry.name,
		kind: 'structured',
		tier: entry.tier,
		isAvailable: async () => {
			if (!entry.enabled) return false
			const aiConfig = await resolveAiConfig(db)
			return aiConfig.isValid
		},
		fetch: ctx => runAiProvider(ctx, providerId),
	}
}

async function runAiProvider(ctx: ScrapeContext, providerId: string): Promise<ProviderResponse> {
	const aiConfig = await resolveAiConfig(db)
	if (!aiConfig.isValid) {
		throw new ScrapeProviderError('config_missing', 'AI provider not configured')
	}

	const start = Date.now()
	const html = await fetchHtmlForLlm(ctx)
	const truncated = truncateHtml(html, MAX_HTML_BYTES)

	const model = createAiModel({
		providerType: aiConfig.providerType.value!,
		apiKey: aiConfig.apiKey.value!,
		model: aiConfig.model.value!,
		baseUrl: aiConfig.baseUrl.value,
	})

	let parsed
	try {
		parsed = await generateObject({
			model,
			schema: scrapeResultSchema,
			abortSignal: ctx.signal,
			system: SYSTEM_PROMPT,
			prompt: `URL: ${ctx.url}\n\nHTML (may be truncated):\n${truncated}`,
		})
	} catch (err) {
		if (err instanceof Error && (err.name === 'AbortError' || /aborted|timeout/i.test(err.message))) {
			throw new ScrapeProviderError('timeout', err.message)
		}
		throw new ScrapeProviderError('invalid_response', err instanceof Error ? err.message : String(err))
	}

	return {
		kind: 'structured',
		providerId,
		result: { ...parsed.object, finalUrl: parsed.object.finalUrl ?? ctx.url },
		fetchMs: Date.now() - start,
	}
}

async function fetchHtmlForLlm(ctx: ScrapeContext): Promise<string> {
	let response: Response
	try {
		// `safeFetch` enforces SSRF-safe URLs and credentials-omit; see
		// sec-review C2 / `src/lib/scrapers/safe-fetch.ts`.
		response = await safeFetch(ctx.url, {
			signal: ctx.signal,
			headers: {
				'user-agent': AI_USER_AGENT,
				accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'accept-language': 'en-US,en;q=0.9',
			},
		})
	} catch (err) {
		if (err instanceof ScrapeProviderError) throw err
		if (err instanceof Error && (err.name === 'AbortError' || /aborted|timeout/i.test(err.message))) {
			throw new ScrapeProviderError('timeout', err.message)
		}
		throw new ScrapeProviderError('network_error', err instanceof Error ? err.message : String(err))
	}
	if (response.status >= 400) {
		// We still try to extract from whatever body we got — the LLM might
		// be able to read a server-error page and report the listing as
		// unavailable, which is itself useful signal. But surface 4xx/5xx
		// distinctly so the orchestrator's classification stays consistent.
		const code = response.status >= 500 ? 'http_5xx' : 'http_4xx'
		throw new ScrapeProviderError(code, `${response.status} fetching for AI`)
	}
	const html = await response.text()
	if (looksLikeBlocked(html)) {
		throw new ScrapeProviderError('bot_block', 'CF wall in AI-fetched body')
	}
	return html
}

function truncateHtml(html: string, capBytes: number): string {
	if (html.length <= capBytes) return html
	// Cut at a tag boundary near the cap when possible to keep the LLM from
	// choking on a half-element. Falls back to a hard cut otherwise.
	const head = html.slice(0, capBytes)
	const lastTag = head.lastIndexOf('>')
	return lastTag > capBytes - 1024 ? head.slice(0, lastTag + 1) : head
}
