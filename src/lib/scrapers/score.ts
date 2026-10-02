import { looksLikeBlocked } from './bot-detect'
import { bestImageClass } from './extractor/images'
import type { ScrapeResult } from './types'

// Score that ends the tier chain: a meaningful title (2), a price (3), and a
// real product photo (3). Anything short of that keeps going to the next
// tier when one is configured, so price and photo are effectively required.
// The admin setting `scrapeQualityThreshold` overrides it; keep the default
// in src/lib/settings.ts and the orchestrator fallback in sync.
export const QUALITY_THRESHOLD = 8

// Minimum score for a persisted attempt to be reused from the URL cache.
// Deliberately separate from QUALITY_THRESHOLD: a page that never shows a
// price can't reach 8, but a title plus a real photo (5) or a title plus a
// price (5) is still worth reusing instead of re-running every paid tier.
export const CACHE_MIN_SCORE = 5

export const SCORE_POINTS = {
	title: 2,
	price: 3,
	photo: 3,
	shareCard: 1,
	description: 1,
	botWall: -3,
	errorTitle: -3,
} as const

export type ScoreSignal = keyof typeof SCORE_POINTS

export type ScoreBreakdown = {
	total: number
	parts: Array<{ signal: ScoreSignal; points: number }>
}

// Returns a score for a scrape result. Higher is better. Inputs:
//   - result: the structured fields the extractor / structured-provider produced
//   - ctx.html (optional): raw HTML body, used for bot-wall detection
//   - ctx.status (optional): HTTP status; informational at this stage but
//     reserved for future rules
//
// Used by the orchestrator both to decide whether to fall through to the next
// provider in the chain and to pick a final winner across all attempts.
export function scoreScrape(result: ScrapeResult, ctx: { html?: string; status?: number } = {}): number {
	return scoreBreakdown(result, ctx).total
}

// The same score, itemized per signal. Persisted with each attempt so
// /admin/scrapes can show why a result scored what it did.
export function scoreBreakdown(result: ScrapeResult, ctx: { html?: string; status?: number } = {}): ScoreBreakdown {
	const parts: ScoreBreakdown['parts'] = []
	const add = (signal: ScoreSignal) => parts.push({ signal, points: SCORE_POINTS[signal] })

	if (hasMeaningfulTitle(result, ctx)) add('title')

	if (result.price && result.price.trim()) add('price')

	// A real product photo earns full credit; a social-share card (the
	// product padded onto a banner) earns a little; thumbnails earn nothing.
	const imageClass = bestImageClass(result.imageUrls)
	if (imageClass === 'photo') add('photo')
	else if (imageClass === 'share-card') add('shareCard')

	if (result.description && result.description.trim().length >= 30) add('description')

	if (ctx.html && looksLikeBlocked(ctx.html)) add('botWall')

	if (result.title && looksLikeErrorTitle(result.title)) add('errorTitle')

	return { total: parts.reduce((sum, p) => sum + p.points, 0), parts }
}

function hasMeaningfulTitle(result: ScrapeResult, ctx: { html?: string }): boolean {
	if (!result.title) return false
	const title = result.title.trim()
	if (title.length === 0) return false
	if (looksLikeErrorTitle(title)) return false
	// Penalise "the title is just the hostname", a common signal of a CDN
	// error page or a near-empty default response.
	const finalUrl = result.finalUrl
	if (finalUrl) {
		try {
			const host = new URL(finalUrl).hostname
			if (title.toLowerCase() === host.toLowerCase()) return false
			if (title.toLowerCase() === host.replace(/^www\./, '').toLowerCase()) return false
		} catch {
			// Ignore, fall through to the html-derived check below.
		}
	}
	// `ctx.html` is used here only as a hook for future rules; explicit cast
	// to void keeps the parameter actively used so future contributors don't
	// remove the threading.
	void ctx
	return true
}

const ERROR_TITLE_PATTERNS: ReadonlyArray<RegExp> = [
	/^\s*\d{3}\b/, // "404", "404 - X", "404: ..."
	/\bpage not found\b/i,
	/\bnot found\b.*\b(?:error|page)?\b/i,
	/\b(?:404|403|500|502|503)\b.*\b(?:error|not found|forbidden|unavailable|service)\b/i,
	/\baccess denied\b/i,
	/\b(?:under|in) maintenance\b/i,
	/\b(?:site|server) (?:is )?(?:temporarily )?(?:unavailable|down)\b/i,
	/\bare you (?:a )?human\b/i,
	/\bverify (?:you are|that you'?re) (?:a )?human\b/i,
	/\bjust a moment\b/i,
	/\bchecking your browser\b/i,
]

function looksLikeErrorTitle(title: string): boolean {
	const t = title.trim()
	if (!t) return false
	return ERROR_TITLE_PATTERNS.some(re => re.test(t))
}
