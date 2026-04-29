// Server-only. Do not import from client/route components.
//
// Thin client over the giftwrapt-scraper Hono facade
// (https://github.com/shawnphoffman/giftwrapt-scraper). The facade itself
// chains browserless → flaresolverr → byparr → scrapfly with bot-block
// detection, so we treat it as a black box: POST {endpoint}/fetch with a
// token header and a {url} body, get back rendered HTML.
//
// Each entry of type `giftwrapt-scraper` in `appSettings.scrapeProviders`
// becomes its own provider in the orchestrator chain. Lets self-hosters
// stand up one shared facade and point multiple giftwrapt deployments at
// it (or run several facades in different regions).

import type { GiftWraptScraperEntry } from '@/lib/settings'

import { looksLikeBlocked } from '../bot-detect'
import type { ProviderResponse, ScrapeContext, ScrapeProvider } from '../types'
import { ScrapeProviderError } from '../types'

const PROVIDER_TYPE = 'giftwrapt-scraper'
const MAX_BODY_BYTES = 5 * 1024 * 1024

// Mapping from the facade's wire-level error codes to our internal
// ScrapeErrorCode enum. The codes that don't appear here are mapped
// generically by HTTP status when the JSON envelope is missing or
// malformed.
type FacadeErrorCode = 'bot_block' | 'timeout' | 'upstream_5xx' | 'config_missing' | 'invalid_url' | 'body_too_large' | 'auth'

type FacadeSuccess = {
	url?: string
	finalUrl?: string
	status?: number
	html?: string
	headers?: Record<string, string>
	fetchMs?: number
	solvedBy?: string
}

type FacadeError = {
	error?: { code?: FacadeErrorCode; message?: string; retryable?: boolean }
}

export function giftwraptScraperProviderId(entryId: string): string {
	return `${PROVIDER_TYPE}:${entryId}`
}

export function createGiftWraptScraperProvider(entry: GiftWraptScraperEntry): ScrapeProvider {
	const providerId = giftwraptScraperProviderId(entry.id)
	return {
		id: providerId,
		name: entry.name,
		kind: 'html',
		tier: entry.tier,
		timeoutMs: entry.timeoutMs,
		isAvailable: () => entry.enabled && isParseableUrl(entry.endpoint) && entry.token.trim().length > 0,
		fetch: ctx => runGiftWraptScraperProvider(ctx, entry, providerId),
	}
}

function isParseableUrl(raw: string): boolean {
	if (!raw.trim()) return false
	try {
		const u = new URL(raw)
		return u.protocol === 'http:' || u.protocol === 'https:'
	} catch {
		return false
	}
}

async function runGiftWraptScraperProvider(
	ctx: ScrapeContext,
	entry: GiftWraptScraperEntry,
	providerId: string
): Promise<ProviderResponse> {
	if (!entry.endpoint) throw new ScrapeProviderError('config_missing', `${entry.name} endpoint is empty`)
	if (!entry.token) throw new ScrapeProviderError('config_missing', `${entry.name} token is empty`)

	const start = Date.now()
	const fetchUrl = new URL('/fetch', entry.endpoint).toString()

	let response: Response
	try {
		response = await fetch(fetchUrl, {
			method: 'POST',
			signal: ctx.signal,
			headers: {
				'X-Browser-Token': entry.token,
				'Content-Type': 'application/json',
				accept: 'application/json',
			},
			body: JSON.stringify({ url: ctx.url }),
		})
	} catch (err) {
		if (err instanceof Error && (err.name === 'AbortError' || /aborted|timeout/i.test(err.message))) {
			throw new ScrapeProviderError('timeout', err.message)
		}
		throw new ScrapeProviderError('network_error', err instanceof Error ? err.message : String(err))
	}

	// Both success and error responses come back as JSON. Try to parse
	// either branch; surface whichever is present.
	let payload: FacadeSuccess & FacadeError
	try {
		payload = (await response.json()) as FacadeSuccess & FacadeError
	} catch {
		throw new ScrapeProviderError('invalid_response', `${entry.name} returned non-JSON body (status ${response.status})`)
	}

	if (!response.ok) {
		const facadeCode = payload.error?.code
		const facadeMsg = payload.error?.message ?? `${entry.name} returned ${response.status}`
		throw mapFacadeError(facadeCode, facadeMsg, response.status, entry.name)
	}

	const html = payload.html ?? ''
	if (!html) {
		throw new ScrapeProviderError('invalid_response', `${entry.name} returned an empty html field`)
	}
	const truncated = html.length > MAX_BODY_BYTES ? html.slice(0, MAX_BODY_BYTES) : html

	if (looksLikeBlocked(truncated)) {
		throw new ScrapeProviderError('bot_block', `${entry.name} body looks like a bot wall`)
	}

	return {
		kind: 'html',
		providerId,
		html: truncated,
		finalUrl: payload.finalUrl ?? ctx.url,
		status: payload.status ?? 200,
		headers: {
			'x-fetch-via': providerId,
			...(payload.solvedBy ? { 'x-solved-by': payload.solvedBy } : {}),
		},
		fetchMs: Date.now() - start,
	}
}

function mapFacadeError(code: FacadeErrorCode | undefined, message: string, httpStatus: number, entryName: string): ScrapeProviderError {
	switch (code) {
		case 'bot_block':
			return new ScrapeProviderError('bot_block', message)
		case 'timeout':
			return new ScrapeProviderError('timeout', message)
		case 'upstream_5xx':
			return new ScrapeProviderError('http_5xx', message)
		case 'auth':
		case 'config_missing':
			return new ScrapeProviderError('config_missing', `${entryName} ${message}`)
		case 'invalid_url':
		case 'body_too_large':
			return new ScrapeProviderError('invalid_response', message)
		default:
			// No code in payload (or unknown code). Fall back to HTTP
			// status classification so generic 4xx/5xx still classify
			// correctly.
			if (httpStatus === 401 || httpStatus === 403)
				return new ScrapeProviderError('config_missing', `${entryName} auth rejected (${httpStatus})`)
			if (httpStatus === 408 || httpStatus === 504) return new ScrapeProviderError('timeout', message)
			if (httpStatus >= 500) return new ScrapeProviderError('http_5xx', message)
			if (httpStatus >= 400) return new ScrapeProviderError('http_4xx', message)
			return new ScrapeProviderError('unknown', message)
	}
}
