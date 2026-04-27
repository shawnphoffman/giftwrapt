import { db } from '@/db'

import { getAppSettings } from '../../settings'
import { looksLikeBlocked } from '../bot-detect'
import { parseCustomHeaders } from '../parse-headers'
import type { ProviderResponse, ScrapeContext, ScrapeProvider, ScrapeResult } from '../types'
import { scrapeResultSchema } from '../types'
import { ScrapeProviderError } from '../types'

// "Bring your own HTTP scraper" providers (0:N). Each entry in
// `appSettings.scrapeCustomHttpProviders` becomes its own ScrapeProvider
// in the orchestrator chain, with a stable id derived from the entry's
// admin-assigned id (e.g. `custom-http:abc123`).
//
// Per entry:
//   { id, name, enabled, endpoint, responseKind: 'html'|'json', customHeaders? }
//
// We GET `${endpoint}?url=<encoded>` with the parsed customHeaders attached
// and read the response per responseKind:
//   - html: returns RawPage and the extractor handles the rest
//   - json: returns StructuredResponse, validated against ScrapeResultSchema
//     so misbehaving custom scrapers can't poison the form
//
// `customHeaders` is the multiline textarea value; one
// `Header-Name: value` per line, blank lines and `#` comments ignored. No
// body templating, no JSON-path mapping, no fancy auth flows. If you need
// any of that, your scraper can normalise on its own side, or you drop a
// TS provider module under src/lib/scrapers/providers/<id>.ts.

const PROVIDER_ID_PREFIX = 'custom-http'
const MAX_BODY_BYTES = 5 * 1024 * 1024

export type CustomHttpEntry = {
	id: string
	name: string
	enabled: boolean
	endpoint: string
	responseKind: 'html' | 'json'
	customHeaders?: string
}

export function customHttpProviderId(entryId: string): string {
	return `${PROVIDER_ID_PREFIX}:${entryId}`
}

// Builds a ScrapeProvider for a single configured entry. Each entry
// becomes one position in the orchestrator chain; this factory is what
// the route handler / server fn calls to materialise them at request
// time.
export function createCustomHttpProvider(entry: CustomHttpEntry): ScrapeProvider {
	const providerId = customHttpProviderId(entry.id)
	return {
		id: providerId,
		kind: 'html',
		mode: 'sequential',
		isAvailable: () => entry.enabled && isParseableUrl(entry.endpoint),
		fetch: ctx => runCustomHttpProvider(ctx, entry, providerId),
	}
}

// Loads the configured entries from appSettings and returns one provider
// per enabled+valid entry. Disabled entries and entries with empty/bad
// endpoints are excluded so they never reach the chain.
export async function loadCustomHttpProviders(): Promise<Array<ScrapeProvider>> {
	const settings = await getAppSettings(db)
	const out: Array<ScrapeProvider> = []
	for (const entry of settings.scrapeCustomHttpProviders) {
		if (!entry.enabled) continue
		if (!isParseableUrl(entry.endpoint)) continue
		out.push(createCustomHttpProvider(entry))
	}
	return out
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

async function runCustomHttpProvider(ctx: ScrapeContext, entry: CustomHttpEntry, providerId: string): Promise<ProviderResponse> {
	if (!entry.enabled) {
		throw new ScrapeProviderError('config_missing', `${entry.name} is disabled`)
	}

	const start = Date.now()
	const endpoint = new URL(entry.endpoint)
	endpoint.searchParams.set('url', ctx.url)

	const headers: Record<string, string> = {
		accept: entry.responseKind === 'json' ? 'application/json' : 'text/html, */*;q=0.5',
	}
	// Layer the user-configured headers on top so they can override `accept`
	// or anything else the provider sets by default. Admin is the source of
	// truth for what their own scraper expects.
	for (const [name, value] of Object.entries(parseCustomHeaders(entry.customHeaders))) {
		headers[name] = value
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
		throw new ScrapeProviderError('config_missing', `${entry.name} auth rejected (${response.status})`)
	}
	if (response.status >= 400 && response.status < 500) {
		throw new ScrapeProviderError('http_4xx', `${entry.name} ${response.status}`)
	}
	if (response.status >= 500) {
		throw new ScrapeProviderError('http_5xx', `${entry.name} ${response.status}`)
	}

	if (entry.responseKind === 'json') {
		return await readJsonResponse(response, ctx, start, providerId, entry.name)
	}
	return await readHtmlResponse(response, ctx, start, providerId, entry.name)
}

async function readHtmlResponse(
	response: Response,
	ctx: ScrapeContext,
	start: number,
	providerId: string,
	entryName: string
): Promise<ProviderResponse> {
	const html = await readBoundedText(response, MAX_BODY_BYTES)
	if (!html) {
		throw new ScrapeProviderError('invalid_response', `${entryName} returned an empty body`)
	}
	if (looksLikeBlocked(html)) {
		throw new ScrapeProviderError('bot_block', `${entryName} returned a CF challenge body`)
	}
	return {
		kind: 'html',
		providerId,
		html,
		finalUrl: ctx.url,
		status: response.status,
		headers: { 'x-fetch-via': providerId },
		fetchMs: Date.now() - start,
	}
}

async function readJsonResponse(
	response: Response,
	ctx: ScrapeContext,
	start: number,
	providerId: string,
	entryName: string
): Promise<ProviderResponse> {
	let payload: unknown
	try {
		payload = await response.json()
	} catch {
		throw new ScrapeProviderError('invalid_response', `${entryName} returned invalid JSON`)
	}
	const parsed = scrapeResultSchema.safeParse(payload)
	if (!parsed.success) {
		throw new ScrapeProviderError('invalid_response', `${entryName} JSON did not match ScrapeResult shape`)
	}
	const result: ScrapeResult = { ...parsed.data, finalUrl: parsed.data.finalUrl ?? ctx.url }
	return {
		kind: 'structured',
		providerId,
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
