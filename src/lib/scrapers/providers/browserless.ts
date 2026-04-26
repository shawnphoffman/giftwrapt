import { env } from '@/env'

import { looksLikeBlocked } from '../bot-detect'
import type { ProviderResponse, ScrapeContext, ScrapeProvider } from '../types'
import { ScrapeProviderError } from '../types'

// Browserless `/content` endpoint returns the rendered HTML of a URL after
// JS executes. Costs more than the built-in fetcher (one container at minimum),
// but earns its keep on JS-heavy SPAs that ship empty HTML to plain GET.
//
// The container itself runs out-of-process; this module just talks to it over
// HTTP. See `_NOTES_/scraping/browserless-plan.md` for the deploy stack.

const PROVIDER_ID = 'browserless-provider'
const MAX_BODY_BYTES = 5 * 1024 * 1024

export const browserlessProvider: ScrapeProvider = {
	id: PROVIDER_ID,
	kind: 'html',
	mode: 'sequential',
	isAvailable: () => Boolean(env.BROWSERLESS_URL),
	fetch: runBrowserlessProvider,
}

async function runBrowserlessProvider(ctx: ScrapeContext): Promise<ProviderResponse> {
	const baseUrl = env.BROWSERLESS_URL
	if (!baseUrl) throw new ScrapeProviderError('config_missing', 'BROWSERLESS_URL not set')

	const start = Date.now()
	const headers: Record<string, string> = { 'content-type': 'application/json' }
	const token = env.BROWSER_TOKEN
	if (token) headers['x-browser-token'] = token

	const endpoint = new URL('/content', baseUrl)
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
		throw new ScrapeProviderError('config_missing', `browserless rejected the token (${response.status})`)
	}
	if (response.status === 408 || response.status === 504) {
		throw new ScrapeProviderError('timeout', `browserless timed out (${response.status})`)
	}
	if (response.status >= 400 && response.status < 500) {
		throw new ScrapeProviderError('http_4xx', `browserless ${response.status}`)
	}
	if (response.status >= 500) {
		throw new ScrapeProviderError('http_5xx', `browserless ${response.status}`)
	}

	const html = await readBoundedText(response, MAX_BODY_BYTES)
	if (!html) {
		throw new ScrapeProviderError('invalid_response', 'browserless returned an empty body')
	}
	if (looksLikeBlocked(html)) {
		throw new ScrapeProviderError('bot_block', 'browserless got a CF challenge')
	}

	return {
		kind: 'html',
		providerId: PROVIDER_ID,
		html,
		// Browserless echoes the final URL via x-response-url when configured;
		// fall back to the request URL when absent.
		finalUrl: response.headers.get('x-response-url') ?? ctx.url,
		status: 200,
		headers: collectHeaders(response),
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

function collectHeaders(response: Response): Record<string, string> {
	const out: Record<string, string> = { 'x-fetch-via': PROVIDER_ID }
	const ct = response.headers.get('content-type')
	if (ct) out['content-type'] = ct
	return out
}
