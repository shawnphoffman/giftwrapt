// Server-only Amazon wishlist fetcher. Lives in its own file so the
// pure parser (`amazon-wishlist.ts`) can be imported by the client
// without dragging the safe-fetch path into the browser bundle.
//
// Tries a single best-effort GET against the wishlist URL via
// `safeFetch` (the same SSRF-blocking helper the scrape orchestrator
// uses for the built-in `fetch` provider). Bot-blocked pages and
// non-2xx responses signal the dialog to fall back to user-pasted HTML
// without us needing a separate Amazon-specific scraper tier; the user
// remains the source of truth for the wishlist contents in that case.
//
// TODO(session-B-coordination): the plan called for routing this
// through the orchestrator so browserbase-stagehand could rescue
// bot-blocked pages. The orchestrator's current public surface returns
// only a structured `ScrapeResult`, not raw HTML, so we can't run our
// list-DOM extractor over the orchestrator's output without changing
// it. Leaving the simpler `safeFetch` path here for now and falling
// through to user-pasted HTML on failure preserves correctness; if we
// extend the orchestrator to expose raw HTML this should switch.

import type { ItemDraft } from '@/api/import'
import { safeFetch } from '@/lib/scrapers/safe-fetch'

import { parseAmazonWishlist } from './amazon-wishlist'

export type FetchAmazonWishlistResult =
	| { kind: 'ok'; drafts: Array<ItemDraft> }
	| { kind: 'fallback-needed'; reason: 'bot-block' | 'fetch-failed' | 'empty' }

const ACCEPT_HEADER = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

export async function fetchAmazonWishlist(url: string): Promise<FetchAmazonWishlistResult> {
	let res: Response
	try {
		res = await safeFetch(url, {
			headers: {
				accept: ACCEPT_HEADER,
				'user-agent': USER_AGENT,
				'accept-language': 'en-US,en;q=0.9',
			},
		})
	} catch {
		return { kind: 'fallback-needed', reason: 'fetch-failed' }
	}
	if (res.status >= 400) {
		// 503 is Amazon's typical bot-block response.
		return { kind: 'fallback-needed', reason: res.status === 503 ? 'bot-block' : 'fetch-failed' }
	}
	let html: string
	try {
		html = await res.text()
	} catch {
		return { kind: 'fallback-needed', reason: 'fetch-failed' }
	}
	const drafts = parseAmazonWishlist(html, url)
	if (drafts.length === 0) {
		return { kind: 'fallback-needed', reason: 'empty' }
	}
	return { kind: 'ok', drafts }
}
