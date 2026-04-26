import * as cheerio from 'cheerio'

import type { ScrapeResult } from '../types'
import { parseHeuristics } from './heuristics'
import { filterAndSortImages } from './images'
import { parseJsonLd } from './json-ld'
import { parseMicrodata } from './microdata'
import { parseOpenGraph } from './open-graph'

// Extracts a unified ScrapeResult from a raw HTML document. Parsers run in
// the order below; for scalar fields (title, description, price, currency,
// siteName) the first non-empty value wins. For imageUrls the lists are
// concatenated in priority order and de-duplicated.
//
// Priority order (highest to lowest):
//   1. Open Graph + Twitter Card
//   2. JSON-LD (Schema.org Product)
//   3. Microdata (Schema.org Product)
//   4. <title> / <meta name="description"> / heuristic image and price
export function extractFromRaw(html: string, finalUrl: string): ScrapeResult {
	const $ = cheerio.load(html)
	const layers: Array<Partial<ScrapeResult>> = [
		parseOpenGraph($, finalUrl),
		parseJsonLd($, finalUrl),
		parseMicrodata($, finalUrl),
		parseHeuristics($, finalUrl),
	]

	const merged: ScrapeResult = { imageUrls: [], finalUrl }
	for (const layer of layers) {
		if (!merged.title && layer.title) merged.title = layer.title
		if (!merged.description && layer.description) merged.description = layer.description
		if (!merged.price && layer.price) merged.price = layer.price
		if (!merged.currency && layer.currency) merged.currency = layer.currency
		if (!merged.siteName && layer.siteName) merged.siteName = layer.siteName
		if (layer.imageUrls && layer.imageUrls.length) {
			for (const url of layer.imageUrls) {
				if (!merged.imageUrls.includes(url)) merged.imageUrls.push(url)
			}
		}
	}
	merged.imageUrls = filterAndSortImages(merged.imageUrls)
	return merged
}
