import { looksLikeBlocked } from '../bot-detect'
import type { ProviderResponse, ScrapeContext, ScrapeProvider } from '../types'
import { ScrapeProviderError } from '../types'

// User-Agent rotation lifted directly from the v1 implementation
// (`group-wish-lists/src/app/api/scraper/route.ts`). Order is signal-first:
//   1. facebookexternalhit  - retailers special-case the FB crawler and
//      return OG-rich, JS-free responses to it.
//   2. Googlebot            - catches sites that don't bother with FB but
//      do serve clean SEO HTML to Google.
//   3. Real browser UA      - last-resort for sites that explicitly block
//      known bot UAs but happily serve a static page to Chrome.
const USER_AGENTS: ReadonlyArray<{ id: string; value: string }> = [
	{ id: 'facebook', value: 'facebookexternalhit/1.1' },
	{ id: 'googlebot', value: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
	{
		id: 'browser',
		value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
	},
]

const MAX_BODY_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_REDIRECTS = 5

const PROVIDER_ID = 'fetch-provider'

// Built-in HTTP fetcher. Always-on, no env required. Tries the UAs above in
// order; returns the first 2xx response that doesn't look like a CF/login
// wall. Falls through (`bot_block`) when every UA is blocked, but bubbles
// 4xx/5xx and network errors directly so the orchestrator can decide
// whether to keep trying other providers.
export const fetchProvider: ScrapeProvider = {
	id: PROVIDER_ID,
	kind: 'html',
	mode: 'sequential',
	isAvailable: () => true,
	fetch: runFetchProvider,
}

async function runFetchProvider(ctx: ScrapeContext): Promise<ProviderResponse> {
	const log = ctx.logger
	let lastBlockReason: 'bot_block' | null = null
	let lastHttpStatus = 0

	for (const ua of USER_AGENTS) {
		if (ctx.signal.aborted) {
			throw new ScrapeProviderError('timeout', 'aborted before next UA attempt')
		}
		const start = Date.now()
		log.debug({ ua: ua.id }, 'fetch attempt')
		try {
			const response = await fetchOne(ctx, ua.value)
			const ms = Date.now() - start
			lastHttpStatus = response.status

			if (response.status === 403 || response.status === 429 || response.status === 503) {
				log.debug({ ua: ua.id, status: response.status, ms }, 'bot-blocked, trying next UA')
				lastBlockReason = 'bot_block'
				continue
			}

			if (response.status >= 400 && response.status < 500) {
				throw new ScrapeProviderError('http_4xx', `${response.status} via ${ua.id}`)
			}
			if (response.status >= 500) {
				throw new ScrapeProviderError('http_5xx', `${response.status} via ${ua.id}`)
			}

			const html = await readBodyWithCap(response, MAX_BODY_BYTES, log)
			if (looksLikeBlocked(html)) {
				log.debug({ ua: ua.id }, 'bot-wall in body, trying next UA')
				lastBlockReason = 'bot_block'
				continue
			}

			return {
				kind: 'html',
				providerId: PROVIDER_ID,
				html,
				finalUrl: response.url,
				status: response.status,
				headers: collectInterestingHeaders(response, ua.id),
				fetchMs: ms,
			}
		} catch (err) {
			if (err instanceof ScrapeProviderError) throw err
			if (err instanceof Error && (err.name === 'AbortError' || /aborted|timeout/i.test(err.message))) {
				// Only source of abort here is `ctx.signal`, which is the
				// overall per-provider budget. Surface as timeout so the
				// orchestrator can show the right code.
				throw new ScrapeProviderError('timeout', err.message)
			}
			if (err instanceof Error) {
				log.warn({ ua: ua.id, err: err.message }, 'network error, trying next UA')
				continue
			}
			throw err
		}
	}

	if (lastBlockReason === 'bot_block') {
		throw new ScrapeProviderError('bot_block', `all UAs blocked (last status ${lastHttpStatus || 'n/a'})`)
	}
	throw new ScrapeProviderError('network_error', 'no UA succeeded')
}

async function fetchOne(ctx: ScrapeContext, userAgent: string): Promise<Response> {
	const headers: Record<string, string> = {
		'user-agent': userAgent,
		accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
		'accept-language': ctx.acceptLanguage ?? 'en-US,en;q=0.9',
		'cache-control': 'no-cache',
		pragma: 'no-cache',
	}
	return fetch(ctx.url, {
		method: 'GET',
		signal: ctx.signal,
		redirect: 'follow',
		headers,
		// `fetch` follows up to its default cap; the spec doesn't expose the
		// MAX_REDIRECTS knob directly. We document the contract here for future
		// adapters that *do* expose it (e.g. when we move to undici directly).
		...({} as Record<string, never>),
	})
}

async function readBodyWithCap(response: Response, capBytes: number, log: ScrapeContext['logger']): Promise<string> {
	if (!response.body) return ''
	const reader = response.body.getReader()
	const chunks: Array<Uint8Array> = []
	let chunkBytes = 0
	let truncated = false
	for (;;) {
		const { value, done } = await reader.read()
		if (done) break
		const remaining = capBytes - chunkBytes
		if (value.length > remaining) {
			if (remaining > 0) {
				const slice = value.slice(0, remaining)
				chunks.push(slice)
				chunkBytes += slice.length
			}
			truncated = true
			try {
				await reader.cancel()
			} catch {
				// reader.cancel can reject if the stream is already closed;
				// nothing useful we can do about it here.
			}
			break
		}
		chunks.push(value)
		chunkBytes += value.length
	}
	if (truncated) {
		log.warn({ capBytes, totalBytes: chunkBytes }, 'response body truncated at cap')
	}
	const charset = parseCharset(response.headers.get('content-type'))
	const buffer = concatChunks(chunks, chunkBytes)
	try {
		return new TextDecoder(charset, { fatal: false }).decode(buffer)
	} catch {
		// Encoding label was bogus; UTF-8 is a safe fallback.
		return new TextDecoder('utf-8', { fatal: false }).decode(buffer)
	}
}

function concatChunks(chunks: Array<Uint8Array>, totalSize: number): Uint8Array {
	const out = new Uint8Array(totalSize)
	let offset = 0
	for (const c of chunks) {
		out.set(c, offset)
		offset += c.length
	}
	return out
}

function parseCharset(contentType: string | null): string {
	if (!contentType) return 'utf-8'
	const m = /charset=([^;]+)/i.exec(contentType)
	return m?.[1]?.trim().toLowerCase() ?? 'utf-8'
}

function collectInterestingHeaders(response: Response, uaId: string): Record<string, string> {
	const out: Record<string, string> = { 'x-fetch-ua': uaId }
	const ct = response.headers.get('content-type')
	if (ct) out['content-type'] = ct
	return out
}

// Re-export the redirect cap so tests/docs can refer to a single source of
// truth. (Native `fetch` doesn't expose a configurable redirect cap, so this
// is informational until we swap in a fetcher that does.)
export const FETCH_PROVIDER_INFO = {
	id: PROVIDER_ID,
	maxBodyBytes: MAX_BODY_BYTES,
	maxRedirects: MAX_REDIRECTS,
	userAgents: USER_AGENTS.map(u => u.id),
} as const
