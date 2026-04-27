// Server-only. Do not import from client/route components.
//
// ScrapFly hosted scraping API (https://scrapfly.io). We GET
// `https://api.scrapfly.io/scrape?key=…&url=…` and pull the rendered
// HTML out of the JSON envelope's `result.content` field, returning a
// RawPage so the standard extractor handles the rest.
//
// Each entry of type `scrapfly` in `appSettings.scrapeProviders` becomes
// its own provider in the orchestrator chain. Optional `asp` /
// `render_js` query params trade credits for anti-bot bypass and
// headless browser rendering.

import type { ScrapflyEntry } from '@/lib/settings'

import { looksLikeBlocked } from '../bot-detect'
import type { ProviderResponse, ScrapeContext, ScrapeProvider } from '../types'
import { ScrapeProviderError } from '../types'

const PROVIDER_TYPE = 'scrapfly'
const SCRAPFLY_ENDPOINT = 'https://api.scrapfly.io/scrape'
const MAX_BODY_BYTES = 5 * 1024 * 1024

type ScrapflySuccess = {
	result?: {
		url?: string
		status_code?: number
		content?: string
		content_type?: string
	}
}

type ScrapflyError = {
	message?: string
	code?: string
	http_code?: number
}

export function scrapflyProviderId(entryId: string): string {
	return `${PROVIDER_TYPE}:${entryId}`
}

export function createScrapflyProvider(entry: ScrapflyEntry): ScrapeProvider {
	const providerId = scrapflyProviderId(entry.id)
	return {
		id: providerId,
		name: entry.name,
		kind: 'html',
		tier: entry.tier,
		isAvailable: () => entry.enabled && entry.apiKey.trim().length > 0,
		fetch: ctx => runScrapflyProvider(ctx, entry, providerId),
	}
}

async function runScrapflyProvider(ctx: ScrapeContext, entry: ScrapflyEntry, providerId: string): Promise<ProviderResponse> {
	if (!entry.apiKey) throw new ScrapeProviderError('config_missing', `${entry.name} api key is empty`)

	const start = Date.now()
	const url = new URL(SCRAPFLY_ENDPOINT)
	url.searchParams.set('key', entry.apiKey)
	url.searchParams.set('url', ctx.url)
	if (entry.asp) url.searchParams.set('asp', 'true')
	if (entry.renderJs) url.searchParams.set('render_js', 'true')

	let response: Response
	try {
		response = await fetch(url.toString(), {
			method: 'GET',
			signal: ctx.signal,
			headers: { accept: 'application/json' },
		})
	} catch (err) {
		if (err instanceof Error && (err.name === 'AbortError' || /aborted|timeout/i.test(err.message))) {
			throw new ScrapeProviderError('timeout', err.message)
		}
		throw new ScrapeProviderError('network_error', err instanceof Error ? err.message : String(err))
	}

	let payload: ScrapflySuccess & ScrapflyError
	try {
		payload = (await response.json()) as ScrapflySuccess & ScrapflyError
	} catch {
		throw new ScrapeProviderError('invalid_response', `${entry.name} returned non-JSON body (status ${response.status})`)
	}

	if (!response.ok) {
		throw mapScrapflyError(payload, response.status, entry.name)
	}

	const html = payload.result?.content ?? ''
	if (!html) {
		throw new ScrapeProviderError('invalid_response', `${entry.name} returned an empty result.content field`)
	}
	const truncated = html.length > MAX_BODY_BYTES ? html.slice(0, MAX_BODY_BYTES) : html

	if (looksLikeBlocked(truncated)) {
		throw new ScrapeProviderError('bot_block', `${entry.name} body looks like a bot wall`)
	}

	return {
		kind: 'html',
		providerId,
		html: truncated,
		finalUrl: payload.result?.url ?? ctx.url,
		status: payload.result?.status_code ?? 200,
		headers: { 'x-fetch-via': providerId },
		fetchMs: Date.now() - start,
	}
}

function mapScrapflyError(payload: ScrapflyError, httpStatus: number, entryName: string): ScrapeProviderError {
	const message = payload.message ?? `${entryName} returned ${httpStatus}`
	const upstream = payload.http_code

	if (httpStatus === 401 || httpStatus === 403) {
		return new ScrapeProviderError('config_missing', `${entryName} auth rejected (${httpStatus})`)
	}
	if (httpStatus === 408 || httpStatus === 504 || upstream === 408 || upstream === 504) {
		return new ScrapeProviderError('timeout', message)
	}
	if (upstream && upstream >= 500) return new ScrapeProviderError('http_5xx', message)
	if (upstream && upstream >= 400) return new ScrapeProviderError('http_4xx', message)
	if (httpStatus >= 500) return new ScrapeProviderError('http_5xx', message)
	if (httpStatus >= 400) return new ScrapeProviderError('http_4xx', message)
	return new ScrapeProviderError('unknown', message)
}
