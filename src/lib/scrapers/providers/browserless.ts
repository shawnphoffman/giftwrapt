// Server-only. Do not import from client/route components.
//
// Browserless `/content` endpoint returns the rendered HTML of a URL after
// JS executes. Costs more than the built-in fetcher (one container at minimum),
// but earns its keep on JS-heavy SPAs that ship empty HTML to plain GET.
//
// Each entry in `appSettings.scrapeProviders` of type `browserless` becomes
// its own provider in the orchestrator chain via `createBrowserlessProvider`.
// The container itself runs out-of-process; this module just talks to it
// over HTTP. See `_NOTES_/scraping/browserless-plan.md` for the deploy stack.

import type { BrowserlessEntry } from '@/lib/settings'

import { looksLikeBlocked } from '../bot-detect'
import type { ProviderResponse, ScrapeContext, ScrapeProvider } from '../types'
import { ScrapeProviderError } from '../types'

const PROVIDER_TYPE = 'browserless'
const MAX_BODY_BYTES = 5 * 1024 * 1024

export function browserlessProviderId(entryId: string): string {
	return `${PROVIDER_TYPE}:${entryId}`
}

export function createBrowserlessProvider(entry: BrowserlessEntry): ScrapeProvider {
	const providerId = browserlessProviderId(entry.id)
	return {
		id: providerId,
		name: entry.name,
		kind: 'html',
		tier: entry.tier,
		isAvailable: () => entry.enabled && isParseableUrl(entry.url),
		fetch: ctx => runBrowserlessProvider(ctx, entry, providerId),
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

async function runBrowserlessProvider(ctx: ScrapeContext, entry: BrowserlessEntry, providerId: string): Promise<ProviderResponse> {
	if (!entry.url) throw new ScrapeProviderError('config_missing', `${entry.name} URL is empty`)

	const start = Date.now()
	const headers: Record<string, string> = { 'content-type': 'application/json' }
	const token = entry.token
	if (token) headers['x-browser-token'] = token

	const endpoint = new URL('/content', entry.url)
	if (token && !endpoint.searchParams.has('token')) {
		endpoint.searchParams.set('token', token)
	}

	let response: Response
	try {
		response = await fetch(endpoint.toString(), {
			method: 'POST',
			signal: ctx.signal,
			headers,
			body: JSON.stringify({
				url: ctx.url,
				gotoOptions: { waitUntil: 'networkidle2', timeout: ctx.perAttemptTimeoutMs },
			}),
		})
	} catch (err) {
		if (err instanceof Error && (err.name === 'AbortError' || /aborted|timeout/i.test(err.message))) {
			throw new ScrapeProviderError('timeout', err.message)
		}
		throw new ScrapeProviderError('network_error', err instanceof Error ? err.message : String(err))
	}

	if (response.status === 401 || response.status === 403) {
		throw new ScrapeProviderError('config_missing', `${entry.name} rejected the token (${response.status})`)
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

	const html = await readBoundedText(response, MAX_BODY_BYTES)
	if (!html) {
		throw new ScrapeProviderError('invalid_response', `${entry.name} returned an empty body`)
	}
	if (looksLikeBlocked(html)) {
		throw new ScrapeProviderError('bot_block', `${entry.name} got a CF challenge`)
	}

	return {
		kind: 'html',
		providerId,
		html,
		// Browserless echoes the final URL via x-response-url when configured;
		// fall back to the request URL when absent.
		finalUrl: response.headers.get('x-response-url') ?? ctx.url,
		status: 200,
		headers: collectHeaders(response, providerId),
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

function collectHeaders(response: Response, providerId: string): Record<string, string> {
	const out: Record<string, string> = { 'x-fetch-via': providerId }
	const ct = response.headers.get('content-type')
	if (ct) out['content-type'] = ct
	return out
}
