import type { CheerioAPI } from 'cheerio'

import type { ScrapeResult } from '../types'
import { resolveUrl } from './url-utils'

// Parses <script type="application/ld+json"> blocks looking for Schema.org
// Product / Offer data. Tolerates @graph wrappers, arrays of mixed types,
// ImageObject / array forms for `image`, AggregateOffer, and Products
// nested under any object key (mainEntity, itemListElement, etc.).
//
// JSON-LD is untyped at the language level, so this file deliberately works
// with `unknown` and narrows defensively. Recursion is bounded to keep
// pathological documents from blowing the stack.
export function parseJsonLd($: CheerioAPI, finalUrl: string): Partial<ScrapeResult> {
	const products: Array<Record<string, unknown>> = []
	const meta: { siteName?: string } = {}
	$('script[type="application/ld+json"]').each((_, el) => {
		const txt = $(el).contents().text()
		if (!txt) return
		try {
			const parsed: unknown = JSON.parse(txt)
			walk(parsed, products, meta, 0)
		} catch {
			// Some retailers ship invalid JSON-LD; ignore and move on.
		}
	})
	if (products.length === 0 && !meta.siteName) return {}

	const result: Partial<ScrapeResult> = {}

	// Walk every Product node and take the first non-empty value for each
	// field. Mirrors the layer-merging behavior in extractor/index.ts so a
	// later Product can fill in what an earlier one was missing.
	for (const product of products) {
		if (!result.title) {
			const name = stringField(product['name'])
			if (name) result.title = name
		}
		if (!result.description) {
			const description = stringField(product['description'])
			if (description) result.description = description
		}
		if (!result.price || !result.currency) {
			const offer = extractOfferInfo(product['offers'])
			if (offer.price && !result.price) result.price = offer.price
			if (offer.currency && !result.currency) result.currency = offer.currency
		}
		if (!result.imageUrls || result.imageUrls.length === 0) {
			const imageUrls = collectImageUrls(product['image'], finalUrl)
			if (imageUrls.length) result.imageUrls = imageUrls
		}
		if (!result.siteName) {
			const brand = readBrandName(product['brand']) ?? readBrandName(product['manufacturer'])
			if (brand) result.siteName = brand
		}
		if (result.ratingValue === undefined || result.ratingCount === undefined) {
			const rating = extractAggregateRating(product['aggregateRating'])
			if (rating.ratingValue !== undefined && result.ratingValue === undefined) result.ratingValue = rating.ratingValue
			if (rating.ratingCount !== undefined && result.ratingCount === undefined) result.ratingCount = rating.ratingCount
		}
	}

	if (!result.siteName && meta.siteName) result.siteName = meta.siteName

	return result
}

const MAX_DEPTH = 12
const MAX_PRODUCTS = 32
const MAX_ARRAY = 200

function walk(node: unknown, products: Array<Record<string, unknown>>, meta: { siteName?: string }, depth: number): void {
	if (depth > MAX_DEPTH || products.length > MAX_PRODUCTS) return
	if (!node || typeof node !== 'object') return
	if (Array.isArray(node)) {
		for (let i = 0; i < node.length && i < MAX_ARRAY; i++) walk(node[i], products, meta, depth + 1)
		return
	}
	const obj = node as Record<string, unknown>
	const types = stringList(obj['@type'])
	if (types.includes('Product')) products.push(obj)
	// Capture WebSite / Organization name as a siteName fallback for
	// product pages that don't surface it via OG.
	if (!meta.siteName && (types.includes('WebSite') || types.includes('Organization'))) {
		const name = stringField(obj['name'])
		if (name) meta.siteName = name
	}
	// Recurse into all object values so we find Products nested under
	// `mainEntity`, `itemListElement`, etc., not just `@graph`.
	for (const value of Object.values(obj)) walk(value, products, meta, depth + 1)
}

function extractOfferInfo(offers: unknown): { price?: string; currency?: string } {
	if (!offers) return {}
	const list = Array.isArray(offers) ? offers : [offers]
	for (const candidate of list) {
		if (!candidate || typeof candidate !== 'object') continue
		const offer = candidate as Record<string, unknown>
		const types = stringList(offer['@type'])

		// AggregateOffer: lowPrice is the headline number on listing pages.
		if (types.includes('AggregateOffer')) {
			const low = stringField(offer['lowPrice']) ?? numberField(offer['lowPrice'])
			const currency = stringField(offer['priceCurrency'])
			if (low) return { price: low, currency }
			// Some sites nest individual offers inside an AggregateOffer.
			const nested = extractOfferInfo(offer['offers'])
			if (nested.price) return nested
			continue
		}

		// Direct Offer.
		const direct = readPriceFields(offer)
		if (direct.price) return direct

		// Some sites move the price into priceSpecification.
		const spec = offer['priceSpecification']
		if (spec && typeof spec === 'object') {
			const specPrice = readPriceFields(spec as Record<string, unknown>)
			if (specPrice.price) return specPrice
		}
	}
	return {}
}

function readPriceFields(obj: Record<string, unknown>): { price?: string; currency?: string } {
	const price = stringField(obj['price']) ?? numberField(obj['price'])
	const currency = stringField(obj['priceCurrency']) ?? stringField(obj['currency'])
	return { price, currency }
}

// Schema.org AggregateRating: { ratingValue, bestRating?, ratingCount?,
// reviewCount? }. Some sites ship it as an array (multiple sources), so we
// pick the first usable entry. ratingValue is normalized against bestRating
// (default 5). ratingCount falls back to reviewCount when ratingCount is
// absent.
function extractAggregateRating(node: unknown): { ratingValue?: number; ratingCount?: number } {
	if (!node) return {}
	const list = Array.isArray(node) ? node : [node]
	for (const entry of list) {
		if (!entry || typeof entry !== 'object') continue
		const obj = entry as Record<string, unknown>
		const raw = numericField(obj['ratingValue'])
		const best = numericField(obj['bestRating']) ?? 5
		const count = integerField(obj['ratingCount']) ?? integerField(obj['reviewCount'])
		const out: { ratingValue?: number; ratingCount?: number } = {}
		if (raw !== undefined && best > 0) {
			const normalized = raw / best
			if (Number.isFinite(normalized)) out.ratingValue = clamp01(normalized)
		}
		if (count !== undefined) out.ratingCount = count
		if (out.ratingValue !== undefined || out.ratingCount !== undefined) return out
	}
	return {}
}

function numericField(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) return value
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value.trim())
		return Number.isFinite(parsed) ? parsed : undefined
	}
	return undefined
}

function integerField(value: unknown): number | undefined {
	const n = numericField(value)
	if (n === undefined) return undefined
	const i = Math.trunc(n)
	return i >= 0 ? i : undefined
}

function clamp01(value: number): number {
	if (value < 0) return 0
	if (value > 1) return 1
	return value
}

function readBrandName(brand: unknown): string | undefined {
	if (!brand) return undefined
	if (typeof brand === 'string') return stringField(brand)
	if (Array.isArray(brand)) {
		for (const b of brand) {
			const name = readBrandName(b)
			if (name) return name
		}
		return undefined
	}
	if (typeof brand === 'object') return stringField((brand as Record<string, unknown>)['name'])
	return undefined
}

function collectImageUrls(node: unknown, finalUrl: string): Array<string> {
	const out: Array<string> = []
	const visit = (value: unknown): void => {
		if (out.length > 32) return
		if (!value) return
		if (typeof value === 'string') {
			if (value.trim()) out.push(resolveUrl(value.trim(), finalUrl))
			return
		}
		if (Array.isArray(value)) {
			for (const item of value) visit(item)
			return
		}
		if (typeof value === 'object') {
			const obj = value as Record<string, unknown>
			// ImageObject form
			if (typeof obj['url'] === 'string') visit(obj['url'])
			else if (typeof obj['contentUrl'] === 'string') visit(obj['contentUrl'])
		}
	}
	visit(node)
	return out
}

function stringField(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberField(value: unknown): string | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined
}

function stringList(value: unknown): Array<string> {
	if (typeof value === 'string') return [value]
	if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
	return []
}
