import { db } from '@/db'

import { getAppSettings } from '../../settings'
import { looksLikeBlocked } from '../bot-detect'
import type { ProviderResponse, ScrapeContext, ScrapeProvider, ScrapeResult } from '../types'
import { scrapeResultSchema } from '../types'
import { ScrapeProviderError } from '../types'

// "Bring your own HTTP scraper" provider. Configured from appSettings:
//   { endpoint, responseKind: 'html' | 'json', authHeaderName?, authHeaderValue? }
//
// We GET `${endpoint}?url=<encoded>` (and optionally one auth header) and
// read the response per responseKind:
//   - html: returns RawPage and the extractor handles the rest
//   - json: returns StructuredResponse, validated against ScrapeResultSchema
//     so misbehaving custom scrapers can't poison the form
//
// No body templating, no JSON-path mapping, no fancy auth flows. If you
// need any of that, your scraper can normalise on its own side, or you
// drop a TS provider module under src/lib/scrapers/providers/<id>.ts.

const PROVIDER_ID = 'custom-http-provider'
const MAX_BODY_BYTES = 5 * 1024 * 1024

export const customHttpProvider: ScrapeProvider = {
	id: PROVIDER_ID,
	kind: 'html',
	mode: 'sequential',
	// Available only when admin has enabled the provider AND filled in a
	// valid http(s) endpoint. The schema accepts empty `endpoint` so the
	// user can flip the switch on first and then type the URL; until then
	// we exclude the provider from the chain rather than letting it fail
	// at fetch time.
	isAvailable: async () => {
		const config = await loadConfig()
		if (!config?.enabled) return false
		return isParseableUrl(config.endpoint)
	},
	fetch: runCustomHttpProvider,
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

type CustomHttpConfig = {
	enabled: boolean
	endpoint: string
	responseKind: 'html' | 'json'
	authHeaderName?: string
	authHeaderValue?: string
}

async function loadConfig(): Promise<CustomHttpConfig | undefined> {
	const settings = await getAppSettings(db)
	return settings.scrapeCustomHttpProvider
}

async function runCustomHttpProvider(ctx: ScrapeContext): Promise<ProviderResponse> {
	const config = await loadConfig()
	if (!config?.enabled) {
		throw new ScrapeProviderError('config_missing', 'custom-http provider not configured')
	}

	const start = Date.now()
	const endpoint = new URL(config.endpoint)
	endpoint.searchParams.set('url', ctx.url)

	const headers: Record<string, string> = {
		accept: config.responseKind === 'json' ? 'application/json' : 'text/html, */*;q=0.5',
	}
	if (config.authHeaderName && config.authHeaderValue) {
		headers[config.authHeaderName.toLowerCase()] = config.authHeaderValue
	}

	let response: Response
	try {
		response = await fetch(endpoint.toString(), {
			method: 'GET',
			signal: ctx.signal,
			headers,
		})
	} catch (err) {
		if (err instanceof Error && (err.name === 'AbortError' || /aborted|timeout/i.test(err.message))) {
			throw new ScrapeProviderError('timeout', err.message)
		}
		throw new ScrapeProviderError('network_error', err instanceof Error ? err.message : String(err))
	}

	if (response.status === 401 || response.status === 403) {
		throw new ScrapeProviderError('config_missing', `custom-http auth rejected (${response.status})`)
	}
	if (response.status >= 400 && response.status < 500) {
		throw new ScrapeProviderError('http_4xx', `custom-http ${response.status}`)
	}
	if (response.status >= 500) {
		throw new ScrapeProviderError('http_5xx', `custom-http ${response.status}`)
	}

	if (config.responseKind === 'json') {
		return await readJsonResponse(response, ctx, start)
	}
	return await readHtmlResponse(response, ctx, start)
}

async function readHtmlResponse(response: Response, ctx: ScrapeContext, start: number): Promise<ProviderResponse> {
	const html = await readBoundedText(response, MAX_BODY_BYTES)
	if (!html) {
		throw new ScrapeProviderError('invalid_response', 'custom-http returned an empty body')
	}
	if (looksLikeBlocked(html)) {
		throw new ScrapeProviderError('bot_block', 'custom-http returned a CF challenge body')
	}
	return {
		kind: 'html',
		providerId: PROVIDER_ID,
		html,
		finalUrl: ctx.url,
		status: response.status,
		headers: { 'x-fetch-via': PROVIDER_ID },
		fetchMs: Date.now() - start,
	}
}

async function readJsonResponse(response: Response, ctx: ScrapeContext, start: number): Promise<ProviderResponse> {
	let payload: unknown
	try {
		payload = await response.json()
	} catch {
		throw new ScrapeProviderError('invalid_response', 'custom-http returned invalid JSON')
	}
	const parsed = scrapeResultSchema.safeParse(payload)
	if (!parsed.success) {
		throw new ScrapeProviderError('invalid_response', 'custom-http JSON did not match ScrapeResult shape')
	}
	const result: ScrapeResult = { ...parsed.data, finalUrl: parsed.data.finalUrl ?? ctx.url }
	return {
		kind: 'structured',
		providerId: PROVIDER_ID,
		result,
		fetchMs: Date.now() - start,
	}
}

async function readBoundedText(response: Response, capBytes: number): Promise<string> {
	if (!response.body) return ''
	const reader = response.body.getReader()
	const chunks: Array<Uint8Array> = []
	let total = 0
	for (;;) {
		const { value, done } = await reader.read()
		if (done) break
		const remaining = capBytes - total
		if (value.length > remaining) {
			if (remaining > 0) {
				chunks.push(value.slice(0, remaining))
				total += remaining
			}
			try {
				await reader.cancel()
			} catch {
				// stream already closed
			}
			break
		}
		chunks.push(value)
		total += value.length
	}
	const out = new Uint8Array(total)
	let offset = 0
	for (const c of chunks) {
		out.set(c, offset)
		offset += c.length
	}
	return new TextDecoder('utf-8', { fatal: false }).decode(out)
}
