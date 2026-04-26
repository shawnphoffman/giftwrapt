import { generateObject } from 'ai'

import { db } from '@/db'
import { createAiModel } from '@/lib/ai-client'
import { resolveAiConfig } from '@/lib/ai-config'
import { getAppSettings } from '@/lib/settings'

import { looksLikeBlocked } from '../bot-detect'
import { type ProviderResponse, type ScrapeContext, type ScrapeProvider, scrapeResultSchema } from '../types'
import { ScrapeProviderError } from '../types'

// Parallel-racing AI provider. Does its own lightweight fetch of the URL
// (browser UA, single attempt, smaller body cap than fetch-provider to
// keep token counts reasonable), then asks the configured LLM to extract
// a ScrapeResult against the zod schema. Returns a StructuredResponse so
// the orchestrator skips the local extractor.
//
// Gated on:
//   1. scrapeAiProviderEnabled (admin toggle)
//   2. resolveAiConfig(db).isValid (a provider is actually configured)
//
// Off by default. Costs money per scrape. Bypasses bot-walled sites only
// to the extent that the LLM-driven extraction can salvage anything from
// a partial fetch; not a CAPTCHA solver.

const PROVIDER_ID = 'ai-provider'

// Keep token costs bounded. ~50KB of HTML is plenty for any retailer page
// to surface OG tags / product structure to the LLM.
const MAX_HTML_BYTES = 50_000

const AI_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36'

const SYSTEM_PROMPT = `You are an HTML product information extractor. Given the HTML content of a single web page, extract structured data about the primary item being sold or described. Return only fields you can confidently identify; leave fields blank when unsure. Do not invent values.`

export const aiProvider: ScrapeProvider = {
	id: PROVIDER_ID,
	kind: 'structured',
	mode: 'parallel',
	isAvailable,
	fetch: runAiProvider,
}

async function isAvailable(): Promise<boolean> {
	const [settings, aiConfig] = await Promise.all([getAppSettings(db), resolveAiConfig(db)])
	if (!settings.scrapeAiProviderEnabled) return false
	return aiConfig.isValid
}

async function runAiProvider(ctx: ScrapeContext): Promise<ProviderResponse> {
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
		providerId: PROVIDER_ID,
		result: { ...parsed.object, finalUrl: parsed.object.finalUrl ?? ctx.url },
		fetchMs: Date.now() - start,
	}
}

async function fetchHtmlForLlm(ctx: ScrapeContext): Promise<string> {
	let response: Response
	try {
		response = await fetch(ctx.url, {
			method: 'GET',
			signal: ctx.signal,
			redirect: 'follow',
			headers: {
				'user-agent': AI_USER_AGENT,
				accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'accept-language': 'en-US,en;q=0.9',
			},
		})
	} catch (err) {
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
