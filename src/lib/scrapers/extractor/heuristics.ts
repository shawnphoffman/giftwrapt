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

	// Site name from <meta name="application-name">, then bare hostname.
	const appName = $('meta[name="application-name"]').attr('content')?.trim()
	if (appName) {
		result.siteName = appName
	} else {
		const host = safeHostname(finalUrl)
		if (host) result.siteName = host
	}

	const price = findVisiblePrice($)
	if (price.price) {
		result.price = price.price
		if (price.currency) result.currency = price.currency
	}

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

function safeHostname(url: string): string | null {
	try {
		return new URL(url).hostname.replace(/^www\./, '')
	} catch {
		return null
	}
}

// Currency-symbol → ISO 4217. Small set on purpose; unrecognised symbols
// still surface a price (just without a currency code).
const CURRENCY_SYMBOLS: Record<string, string> = {
	$: 'USD',
	'€': 'EUR',
	'£': 'GBP',
	'¥': 'JPY',
	'₹': 'INR',
	'₩': 'KRW',
	'₽': 'RUB',
}
const CURRENCY_PREFIXES: Array<{ prefix: string; code: string }> = [
	{ prefix: 'US$', code: 'USD' },
	{ prefix: 'C$', code: 'CAD' },
	{ prefix: 'A$', code: 'AUD' },
	{ prefix: 'NZ$', code: 'NZD' },
	{ prefix: 'HK$', code: 'HKD' },
	{ prefix: 'R$', code: 'BRL' },
	{ prefix: 'CHF', code: 'CHF' },
	{ prefix: 'kr', code: 'SEK' },
]

// Selectors most likely to hold a clean price string. Ordered specific →
// generic so the strongest signal wins.
const PRICE_SELECTORS = [
	'meta[itemprop="price"]',
	'[itemprop="price"]',
	'meta[property="product:price:amount"]',
	'[data-price]',
	'[data-product-price]',
	'.price-current',
	'.product-price',
	'.product__price',
	'.our-price',
	'[class*="ProductPrice"]',
	'[class*="product-price"]',
	'.price',
	'[class~="price"]',
]

function findVisiblePrice($: CheerioAPI): { price?: string; currency?: string } {
	for (const sel of PRICE_SELECTORS) {
		for (const el of $(sel).toArray()) {
			const node = $(el)
			const candidates: Array<string | undefined> = [
				node.attr('content'),
				node.attr('data-price'),
				node.attr('data-product-price'),
				node.attr('value'),
				node.text(),
			]
			for (const candidate of candidates) {
				if (!candidate) continue
				const parsed = parsePriceText(candidate)
				if (parsed) return parsed
			}
		}
	}
	return {}
}

const NUMBER_RE = /\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{1,2})?/

function parsePriceText(text: string): { price?: string; currency?: string } | null {
	const trimmed = text.trim()
	if (!trimmed) return null

	// Plain number (e.g. content="29.99"): take it as-is, no currency.
	if (/^\d+(?:[.,]\d{1,2})?$/.test(trimmed)) {
		return { price: normalizeNumber(trimmed) }
	}

	// Multi-character currency prefix (US$, R$, CHF…) at the start.
	for (const { prefix, code } of CURRENCY_PREFIXES) {
		const idx = trimmed.toUpperCase().indexOf(prefix.toUpperCase())
		if (idx === -1 || idx > 4) continue
		const after = trimmed.slice(idx + prefix.length)
		const match = after.match(NUMBER_RE)
		if (match) return { price: normalizeNumber(match[0]), currency: code }
	}

	// Single-character currency symbol next to a number, in either order.
	const symbolBefore = trimmed.match(
		new RegExp(`([${escapeForCharClass(Object.keys(CURRENCY_SYMBOLS).join(''))}])\\s*(${NUMBER_RE.source})`)
	)
	if (symbolBefore) {
		return { price: normalizeNumber(symbolBefore[2]), currency: CURRENCY_SYMBOLS[symbolBefore[1]] }
	}
	const symbolAfter = trimmed.match(
		new RegExp(`(${NUMBER_RE.source})\\s*([${escapeForCharClass(Object.keys(CURRENCY_SYMBOLS).join(''))}])`)
	)
	if (symbolAfter) {
		return { price: normalizeNumber(symbolAfter[1]), currency: CURRENCY_SYMBOLS[symbolAfter[2]] }
	}

	// ISO code suffix (e.g. "29.99 USD" or "29,99 EUR").
	const iso = trimmed.match(new RegExp(`(${NUMBER_RE.source})\\s*([A-Z]{3})\\b`))
	if (iso) return { price: normalizeNumber(iso[1]), currency: iso[2] }

	// Last resort: a bare number anywhere in the string, no currency.
	const bare = trimmed.match(NUMBER_RE)
	if (bare) return { price: normalizeNumber(bare[0]) }

	return null
}

function escapeForCharClass(s: string): string {
	return s.replace(/[\\\]^-]/g, '\\$&')
}

// Standardize thousands/decimal separators to a US-style number so the
// price field always parses cleanly downstream.
function normalizeNumber(raw: string): string {
	const cleaned = raw.replace(/\s/g, '')
	const lastDot = cleaned.lastIndexOf('.')
	const lastComma = cleaned.lastIndexOf(',')
	const decimalIdx = Math.max(lastDot, lastComma)
	if (decimalIdx === -1) return cleaned
	const trailing = cleaned.length - decimalIdx - 1
	if (trailing >= 1 && trailing <= 2) {
		const intPart = cleaned.slice(0, decimalIdx).replace(/[.,]/g, '')
		const decPart = cleaned.slice(decimalIdx + 1)
		return `${intPart}.${decPart}`
	}
	return cleaned.replace(/[.,]/g, '')
}
