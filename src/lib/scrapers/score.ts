import { looksLikeBlocked } from './bot-detect'
import type { ScrapeResult } from './types'

// Threshold the orchestrator uses to short-circuit the sequential chain.
// Anything at or above this score is "good enough" to stop trying further
// providers. Tunable later via appSettings if it proves too lenient/strict.
export const QUALITY_THRESHOLD = 3

// Returns a score for a scrape result. Higher is better. Inputs:
//   - result: the structured fields the extractor / structured-provider produced
//   - ctx.html (optional): raw HTML body, used for bot-wall detection
//   - ctx.status (optional): HTTP status; informational at this stage but
//     reserved for future rules
//
// Used by the orchestrator both to decide whether to fall through to the next
// provider in the chain and to pick a final winner across all attempts.
export function scoreScrape(result: ScrapeResult, ctx: { html?: string; status?: number } = {}): number {
	let score = 0

	if (hasMeaningfulTitle(result, ctx)) score += 2

	if (hasReasonableImage(result)) score += 2

	if (result.price && result.price.trim()) score += 1

	if (result.description && result.description.trim().length >= 30) score += 1

	if (ctx.html && looksLikeBlocked(ctx.html)) score -= 3

	return score
}

function hasMeaningfulTitle(result: ScrapeResult, ctx: { html?: string }): boolean {
	if (!result.title) return false
	const title = result.title.trim()
	if (title.length === 0) return false
	// Penalise "the title is just the hostname", a common signal of a CDN
	// error page or a near-empty default response.
	const finalUrl = result.finalUrl
	if (finalUrl) {
		try {
			const host = new URL(finalUrl).hostname
			if (title.toLowerCase() === host.toLowerCase()) return false
			if (title.toLowerCase() === host.replace(/^www\./, '').toLowerCase()) return false
		} catch {
			// Ignore — fall through to the html-derived check below.
		}
	}
	// `ctx.html` is used here only as a hook for future rules; explicit cast
	// to void keeps the parameter actively used so future contributors don't
	// remove the threading.
	void ctx
	return true
}

function hasReasonableImage(result: ScrapeResult): boolean {
	if (result.imageUrls.length === 0) return false
	for (const url of result.imageUrls) {
		if (url && !looksLikeTrackingPixel(url)) return true
	}
	return false
}

function looksLikeTrackingPixel(url: string): boolean {
	if (/_1x1\b/i.test(url)) return true
	const trackers = [
		'doubleclick.net',
		'googletagmanager.com',
		'google-analytics.com',
		'facebook.com/tr',
		'scorecardresearch.com',
		'adservice.',
		'pixel.',
		'tracker.',
	]
	const lower = url.toLowerCase()
	if (trackers.some(t => lower.includes(t))) return true
	try {
		const params = new URL(url).searchParams
		const w = params.get('w') ?? params.get('width')
		const h = params.get('h') ?? params.get('height')
		return w === '1' && h === '1'
	} catch {
		return false
	}
}
