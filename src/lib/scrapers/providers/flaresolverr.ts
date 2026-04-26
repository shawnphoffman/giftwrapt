import { env } from '@/env'

import { looksLikeBlocked } from '../bot-detect'
import type { ProviderResponse, ScrapeContext, ScrapeProvider } from '../types'
import { ScrapeProviderError } from '../types'

// Flaresolverr exposes a single POST endpoint at /v1; we send `request.get`
// and read back the solved HTML + final URL. Use only for sites that hit a
// Cloudflare wall in front of the actual page; for everything else
// browserless or fetch is faster and cheaper.

const PROVIDER_ID = 'flaresolverr-provider'

export const flaresolverrProvider: ScrapeProvider = {
	id: PROVIDER_ID,
	kind: 'html',
	mode: 'sequential',
	isAvailable: () => Boolean(env.FLARESOLVERR_URL),
	fetch: runFlaresolverrProvider,
}

type FlaresolverrSolution = {
	url?: string
	status?: number
	response?: string
	userAgent?: string
}

type FlaresolverrEnvelope = {
	status?: 'ok' | 'error'
	message?: string
	solution?: FlaresolverrSolution
}

async function runFlaresolverrProvider(ctx: ScrapeContext): Promise<ProviderResponse> {
	const baseUrl = env.FLARESOLVERR_URL
	if (!baseUrl) throw new ScrapeProviderError('config_missing', 'FLARESOLVERR_URL not set')

	const start = Date.now()
	const endpoint = new URL('/v1', baseUrl)

	let response: Response
	try {
		response = await fetch(endpoint.toString(), {
			method: 'POST',
			signal: ctx.signal,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				cmd: 'request.get',
				url: ctx.url,
				maxTimeout: ctx.perAttemptTimeoutMs,
			}),
		})
	} catch (err) {
		if (err instanceof Error && (err.name === 'AbortError' || /aborted|timeout/i.test(err.message))) {
			throw new ScrapeProviderError('timeout', err.message)
		}
		throw new ScrapeProviderError('network_error', err instanceof Error ? err.message : String(err))
	}

	if (response.status >= 400 && response.status < 500) {
		throw new ScrapeProviderError('http_4xx', `flaresolverr ${response.status}`)
	}
	if (response.status >= 500) {
		throw new ScrapeProviderError('http_5xx', `flaresolverr ${response.status}`)
	}

	const envelope = (await response.json()) as FlaresolverrEnvelope
	if (envelope.status !== 'ok') {
		const reason = envelope.message ?? 'unknown'
		// Flaresolverr returns "ERROR: Cloudflare ..." messages when it can't
		// solve. Treat those as bot_block so the orchestrator falls through.
		if (/cloudflare|challenge/i.test(reason)) {
			throw new ScrapeProviderError('bot_block', reason)
		}
		throw new ScrapeProviderError('invalid_response', reason)
	}

	const solution = envelope.solution
	if (!solution) {
		throw new ScrapeProviderError('invalid_response', 'flaresolverr returned no solution')
	}
	const html = solution.response
	if (!html) {
		throw new ScrapeProviderError('invalid_response', 'flaresolverr returned an empty solution body')
	}
	if (looksLikeBlocked(html)) {
		throw new ScrapeProviderError('bot_block', 'flaresolverr returned a CF challenge body')
	}

	return {
		kind: 'html',
		providerId: PROVIDER_ID,
		html,
		finalUrl: solution.url ?? ctx.url,
		status: solution.status ?? 200,
		headers: { 'x-fetch-via': PROVIDER_ID, ...(solution.userAgent ? { 'x-fetch-ua-string': solution.userAgent } : {}) },
		fetchMs: Date.now() - start,
	}
}
