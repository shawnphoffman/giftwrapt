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

	return result
}

function readProp($: CheerioAPI, scope: ReturnType<CheerioAPI>, prop: string): string | undefined {
	const el = scope.find(`[itemprop="${prop}"]`).first()
	if (el.length === 0) return undefined
	const value = el.attr('content') ?? el.attr('value') ?? $(el).text()
	return value && value.trim() ? value.trim() : undefined
}
