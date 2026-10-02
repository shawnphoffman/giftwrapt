// `cheerio/slim` exports the same `load` we use, but skips the top-level
// `import * as undici from 'undici'` that the full entry does for
// `cheerio.fromURL`. Vite hoists undici's lazy `require('node:sqlite')`
// into a static top-level `import 'node:sqlite'` in the bundled server
// output, which trips Node's "ExperimentalWarning: SQLite" at boot. We
// never call `fromURL`, so slim is a drop-in.
import * as cheerio from 'cheerio/slim'

import type { ScrapeResult } from '../types'
import { parseAmazon } from './amazon'
import { parseAxes } from './axes'
import { parseHeuristics } from './heuristics'
import { filterAndSortImages } from './images'
import { parseJsonLd } from './json-ld'
import { parseMicrodata } from './microdata'
import { parseOpenGraph } from './open-graph'

// Extracts a unified ScrapeResult from a raw HTML document. Parsers run in
// the order below; for scalar fields (title, description, siteName) the
// first non-empty value wins. For imageUrls the lists are concatenated in
// priority order, de-duplicated, and ranked by quality class.
//
// Price and currency are the exception: they come as a pair from one layer,
// in PRICE_LAYER_ORDER, so a JSON-LD price never ends up with an OG
// currency. JSON-LD outranks OG for price because OG price tags go stale
// (a variant's price, a list price) while the JSON-LD Offer is what the
// page renders; on every sampled page where the two disagreed, the
// displayed price matched JSON-LD.
//
// Priority order (highest to lowest):
//   0. Retailer layers (Amazon only today): price and the real product
//      photo, which the generic layers miss or rank below a share card
//   1. Open Graph + Twitter Card
//   2. JSON-LD (Schema.org Product)
//   3. Microdata (Schema.org Product)
//   4. <title> / <meta name="description"> / heuristic image and price
export function extractFromRaw(html: string, finalUrl: string): ScrapeResult {
	const $ = cheerio.load(html)
	const amazon = parseAmazon($, finalUrl)
	const openGraph = parseOpenGraph($, finalUrl)
	const jsonLd = parseJsonLd($, finalUrl)
	const microdata = parseMicrodata($, finalUrl)
	const heuristics = parseHeuristics($, finalUrl)
	const layers: Array<Partial<ScrapeResult>> = [amazon, openGraph, jsonLd, microdata, heuristics, parseAxes($, finalUrl)]
	const priceLayers: Array<Partial<ScrapeResult>> = [amazon, jsonLd, openGraph, microdata, heuristics]

	const merged: ScrapeResult = { imageUrls: [], finalUrl }
	for (const layer of layers) {
		if (!merged.title && layer.title) merged.title = layer.title
		if (!merged.description && layer.description) merged.description = layer.description
		if (!merged.siteName && layer.siteName) merged.siteName = layer.siteName
		if (merged.ratingValue === undefined && layer.ratingValue !== undefined) merged.ratingValue = layer.ratingValue
		if (merged.ratingCount === undefined && layer.ratingCount !== undefined) merged.ratingCount = layer.ratingCount
		if (layer.imageUrls && layer.imageUrls.length) {
			for (const url of layer.imageUrls) {
				if (!merged.imageUrls.includes(url)) merged.imageUrls.push(url)
			}
		}
		if (!merged.purchaseVariants && layer.purchaseVariants && layer.purchaseVariants.length) {
			merged.purchaseVariants = [...layer.purchaseVariants]
		}
	}
	const priceSource = priceLayers.find(l => l.price && l.price.trim())
	if (priceSource) {
		merged.price = tidyPrice(priceSource.price!)
		// Currency from the same layer; otherwise the first layer that has
		// one (a bare `content="29.99"` price with an og:price:currency).
		merged.currency = priceSource.currency ?? priceLayers.find(l => l.currency)?.currency
	}
	merged.imageUrls = filterAndSortImages(merged.imageUrls)
	return merged
}

// Cosmetic cleanup for a plain numeric price, since the form shows it
// verbatim: "2,100.00" -> "2100.00", "169.0" -> "169.00". Never rounds, and
// leaves anything that isn't a plain US-style number alone.
export function tidyPrice(price: string): string {
	let p = price.trim()
	if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(p)) p = p.replace(/,/g, '')
	if (/^\d+\.\d$/.test(p)) p = `${p}0`
	return p
}
