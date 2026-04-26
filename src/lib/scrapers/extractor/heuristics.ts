import type { CheerioAPI } from 'cheerio'

import type { ScrapeResult } from '../types'
import { resolveUrl } from './url-utils'

// Last-resort extractors for sites that don't ship OG / JSON-LD / microdata.
// Deliberately conservative: only fills fields that the higher-priority
// parsers couldn't, and only when the heuristic is reasonably confident.
export function parseHeuristics($: CheerioAPI, finalUrl: string): Partial<ScrapeResult> {
	const result: Partial<ScrapeResult> = {}

	const title = $('head > title').first().text().trim()
	if (title) result.title = title

	const description = $('meta[name="description"]').attr('content')?.trim()
	if (description) result.description = description

	// Pick the first <img> in document order that has a src and isn't a tiny
	// tracking pixel based on its declared dimensions. Image filtering proper
	// happens later (in commit 3); this is just so the heuristic doesn't
	// leak obvious 1x1 pixels into the candidate list when nothing else has.
	const images: Array<string> = []
	$('img').each((_, el) => {
		const src = $(el).attr('src') ?? $(el).attr('data-src')
		if (!src || !src.trim()) return
		const width = Number($(el).attr('width'))
		const height = Number($(el).attr('height'))
		if (Number.isFinite(width) && Number.isFinite(height) && width <= 2 && height <= 2) return
		images.push(resolveUrl(src.trim(), finalUrl))
	})
	if (images.length) result.imageUrls = images.slice(0, 8)

	return result
}
