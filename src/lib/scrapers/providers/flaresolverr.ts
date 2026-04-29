// Server-only. Do not import from client/route components.
//
// Flaresolverr exposes a single POST endpoint at /v1; we send `request.get`
// and read back the solved HTML + final URL. Use only for sites that hit a
// Cloudflare wall in front of the actual page; for everything else
// browserless or fetch is faster and cheaper.
//
// Each entry in `appSettings.scrapeProviders` of type `flaresolverr` becomes
// its own provider in the orchestrator chain via `createFlaresolverrProvider`.

import type { FlaresolverrEntry } from '@/lib/settings'

import { looksLikeBlocked } from '../bot-detect'
import type { ProviderResponse, ScrapeContext, ScrapeProvider } from '../types'
import { ScrapeProviderError } from '../types'

const PROVIDER_TYPE = 'flaresolverr'

export function flaresolverrProviderId(entryId: string): string {
	return `${PROVIDER_TYPE}:${entryId}`
}

export function createFlaresolverrProvider(entry: FlaresolverrEntry): ScrapeProvider {
	const providerId = flaresolverrProviderId(entry.id)
	return {
		id: providerId,
		name: entry.name,
		kind: 'html',
		tier: entry.tier,
		timeoutMs: entry.timeoutMs,
		isAvailable: () => entry.enabled && isParseableUrl(entry.url),
		fetch: ctx => runFlaresolverrProvider(ctx, entry, providerId),
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

async function runFlaresolverrProvider(ctx: ScrapeContext, entry: FlaresolverrEntry, providerId: string): Promise<ProviderResponse> {
	if (!entry.url) throw new ScrapeProviderError('config_missing', `${entry.name} URL is empty`)

	const start = Date.now()
	const endpoint = new URL('/v1', entry.url)

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
		throw new ScrapeProviderError('http_4xx', `${entry.name} ${response.status}`)
	}
	if (response.status >= 500) {
		throw new ScrapeProviderError('http_5xx', `${entry.name} ${response.status}`)
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
		throw new ScrapeProviderError('invalid_response', `${entry.name} returned no solution`)
	}
	const html = solution.response
	if (!html) {
		throw new ScrapeProviderError('invalid_response', `${entry.name} returned an empty solution body`)
	}
	if (looksLikeBlocked(html)) {
		throw new ScrapeProviderError('bot_block', `${entry.name} returned a CF challenge body`)
	}

	return {
		kind: 'html',
		providerId,
		html,
		finalUrl: solution.url ?? ctx.url,
		status: solution.status ?? 200,
		headers: { 'x-fetch-via': providerId, ...(solution.userAgent ? { 'x-fetch-ua-string': solution.userAgent } : {}) },
		fetchMs: Date.now() - start,
	}
}
