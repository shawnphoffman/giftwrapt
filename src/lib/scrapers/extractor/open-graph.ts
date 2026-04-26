import type { CheerioAPI } from 'cheerio'

import type { ScrapeResult } from '../types'
import { resolveUrl } from './url-utils'

// Parses Open Graph + Twitter Card meta tags. Most retailers special-case
// these so they're our highest-signal source for HTML responses.
export function parseOpenGraph($: CheerioAPI, finalUrl: string): Partial<ScrapeResult> {
	const result: Partial<ScrapeResult> = {}

	const get = (...names: Array<string>): string | undefined => {
		for (const name of names) {
			const property = $(`meta[property="${name}"]`).attr('content')
			if (property && property.trim()) return property.trim()
			const named = $(`meta[name="${name}"]`).attr('content')
			if (named && named.trim()) return named.trim()
		}
		return undefined
	}

	const title = get('og:title', 'twitter:title')
	if (title) result.title = title

	const description = get('og:description', 'twitter:description')
	if (description) result.description = description

	const siteName = get('og:site_name')
	if (siteName) result.siteName = siteName

	const price = get('og:price:amount', 'product:price:amount')
	if (price) result.price = price

	const currency = get('og:price:currency', 'product:price:currency')
	if (currency) result.currency = currency

	const images: Array<string> = []
	const imageSelectors = [
		'meta[property="og:image"]',
		'meta[property="og:image:url"]',
		'meta[property="og:image:secure_url"]',
		'meta[name="twitter:image"]',
		'meta[name="twitter:image:src"]',
	].join(', ')
	$(imageSelectors).each((_, el) => {
		const v = $(el).attr('content')
		if (v && v.trim()) images.push(resolveUrl(v.trim(), finalUrl))
	})
	if (images.length) result.imageUrls = images

	return result
}
