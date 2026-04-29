// Server-only. Do not import from client/route components.
//
// Thin client over Browserbase's hosted Fetch API
// (https://docs.browserbase.com/reference/api/fetch-a-page). Each entry of
// type `browserbase-fetch` in `appSettings.scrapeProviders` becomes its own
// provider in the orchestrator chain.
//
// Cheap and fast: one HTTP round-trip to api.browserbase.com, no Browserbase
// session, no LLM call. Browserbase handles JS-execution and (optionally)
// proxies; we just pull the rendered HTML and hand it to the existing
// extractor. Best for pages where JS-rendering matters but extraction
// doesn't need an LLM.

import type { BrowserbaseFetchEntry } from '@/lib/settings'

import { looksLikeBlocked } from '../bot-detect'
import type { ProviderResponse, ScrapeContext, ScrapeProvider } from '../types'
import { ScrapeProviderError } from '../types'

const PROVIDER_TYPE = 'browserbase-fetch'
const API_ENDPOINT = 'https://api.browserbase.com/v1/fetch'
const MAX_BODY_BYTES = 5 * 1024 * 1024

type BrowserbaseFetchEnvelope = {
	id?: string
	statusCode?: number
	headers?: Record<string, string>
	content?: string
	contentType?: string
	encoding?: string
}

export function browserbaseFetchProviderId(entryId: string): string {
	return `${PROVIDER_TYPE}:${entryId}`
}

export function createBrowserbaseFetchProvider(entry: BrowserbaseFetchEntry): ScrapeProvider {
	const providerId = browserbaseFetchProviderId(entry.id)
	return {
		id: providerId,
		name: entry.name,
		kind: 'html',
		tier: entry.tier,
		timeoutMs: entry.timeoutMs,
		isAvailable: () => entry.enabled && entry.apiKey.trim().length > 0,
		fetch: ctx => runBrowserbaseFetchProvider(ctx, entry, providerId),
	}
}

async function runBrowserbaseFetchProvider(
	ctx: ScrapeContext,
	entry: BrowserbaseFetchEntry,
	providerId: string
): Promise<ProviderResponse> {
	if (!entry.apiKey) throw new ScrapeProviderError('config_missing', `${entry.name} apiKey is empty`)

	const start = Date.now()

	let response: Response
	try {
		response = await fetch(API_ENDPOINT, {
			method: 'POST',
			signal: ctx.signal,
			headers: {
				'X-BB-API-Key': entry.apiKey,
				'Content-Type': 'application/json',
				accept: 'application/json',
			},
			body: JSON.stringify({
				url: ctx.url,
				allowRedirects: entry.allowRedirects,
				proxies: entry.proxies,
			}),
		})
	} catch (err) {
		if (err instanceof Error && (err.name === 'AbortError' || /aborted|timeout/i.test(err.message))) {
			throw new ScrapeProviderError('timeout', err.message)
		}
		throw new ScrapeProviderError('network_error', err instanceof Error ? err.message : String(err))
	}

	if (response.status === 401 || response.status === 403) {
		throw new ScrapeProviderError('config_missing', `${entry.name} auth rejected (${response.status})`)
	}
	if (response.status === 408 || response.status === 504) {
		throw new ScrapeProviderError('timeout', `${entry.name} timed out (${response.status})`)
	}
	if (response.status >= 400 && response.status < 500) {
		throw new ScrapeProviderError('http_4xx', `${entry.name} ${response.status}`)
	}
	if (response.status >= 500) {
		throw new ScrapeProviderError('http_5xx', `${entry.name} ${response.status}`)
	}

	let envelope: BrowserbaseFetchEnvelope
	try {
		envelope = (await response.json()) as BrowserbaseFetchEnvelope
	} catch {
		throw new ScrapeProviderError('invalid_response', `${entry.name} returned invalid JSON`)
	}

	const content = envelope.content ?? ''
	if (!content) {
		throw new ScrapeProviderError('invalid_response', `${entry.name} returned an empty body`)
	}

	const contentType = envelope.contentType ?? ''
	if (!isHtmlContentType(contentType)) {
		throw new ScrapeProviderError('invalid_response', `${entry.name} returned non-HTML content type "${contentType || 'unknown'}"`)
	}

	const html = content.length > MAX_BODY_BYTES ? content.slice(0, MAX_BODY_BYTES) : content
	if (looksLikeBlocked(html)) {
		throw new ScrapeProviderError('bot_block', `${entry.name} returned a CF challenge body`)
	}

	return {
		kind: 'html',
		providerId,
		html,
		// Browserbase's Fetch API doesn't currently expose a post-redirect
		// final URL field. The target URL we requested is the safe fallback;
		// the extractor reads canonical/og:url from the HTML if needed.
		finalUrl: ctx.url,
		status: envelope.statusCode ?? 200,
		headers: { 'x-fetch-via': providerId, ...(contentType ? { 'content-type': contentType } : {}) },
		fetchMs: Date.now() - start,
	}
}

function isHtmlContentType(contentType: string): boolean {
	if (!contentType) return false
	const lowered = contentType.toLowerCase()
	return lowered.includes('text/html') || lowered.includes('application/xhtml')
}
