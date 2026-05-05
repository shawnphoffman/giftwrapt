import type { CheerioAPI } from 'cheerio'

import type { ScrapeResult } from '../types'
import { resolveUrl } from './url-utils'

// Parses Schema.org microdata (itemscope + itemprop) for Product. Less
// common today but still present on a long tail of older retailer pages.
export function parseMicrodata($: CheerioAPI, finalUrl: string): Partial<ScrapeResult> {
	const product = $('[itemscope][itemtype*="schema.org/Product"]').first()
	if (product.length === 0) return {}

	const result: Partial<ScrapeResult> = {}
	const name = readProp($, product, 'name')
	if (name) result.title = name

	const description = readProp($, product, 'description')
	if (description) result.description = description

	const offerScope = product.find('[itemscope][itemtype*="schema.org/Offer"]').first()
	const priceSource = offerScope.length ? offerScope : product
	const price = readProp($, priceSource, 'price')
	if (price) result.price = price
	const currency = readProp($, priceSource, 'priceCurrency')
	if (currency) result.currency = currency

	const images: Array<string> = []
	product.find('[itemprop="image"]').each((_, el) => {
		const node = $(el)
		const value = node.attr('content') ?? node.attr('src') ?? node.attr('href')
		if (value && value.trim()) images.push(resolveUrl(value.trim(), finalUrl))
	})
	if (images.length) result.imageUrls = images

	const ratingScope = product.find('[itemscope][itemtype*="schema.org/AggregateRating"]').first()
	const ratingSource = ratingScope.length ? ratingScope : product
	const rawRating = readProp($, ratingSource, 'ratingValue')
	const bestRating = readProp($, ratingSource, 'bestRating')
	const ratingCount = readProp($, ratingSource, 'ratingCount') ?? readProp($, ratingSource, 'reviewCount')
	if (rawRating) {
		const raw = Number.parseFloat(rawRating)
		const best = bestRating ? Number.parseFloat(bestRating) : 5
		if (Number.isFinite(raw) && Number.isFinite(best) && best > 0) {
			const normalized = raw / best
			if (Number.isFinite(normalized)) result.ratingValue = clamp01(normalized)
		}
	}
	if (ratingCount) {
		const parsed = Number.parseInt(ratingCount.replace(/[^0-9]/g, ''), 10)
		if (Number.isFinite(parsed) && parsed >= 0) result.ratingCount = parsed
	}

	return result
}

function readProp($: CheerioAPI, scope: ReturnType<CheerioAPI>, prop: string): string | undefined {
	const el = scope.find(`[itemprop="${prop}"]`).first()
	if (el.length === 0) return undefined
	const value = el.attr('content') ?? el.attr('value') ?? $(el).text()
	return value && value.trim() ? value.trim() : undefined
}

function clamp01(value: number): number {
	if (value < 0) return 0
	if (value > 1) return 1
	return value
}
