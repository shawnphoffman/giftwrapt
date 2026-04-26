import type { CheerioAPI } from 'cheerio'

import type { ScrapeResult } from '../types'
import { resolveUrl } from './url-utils'

// Parses <script type="application/ld+json"> blocks looking for Schema.org
// Product / Offer data. Tolerates @graph wrappers, arrays of mixed types,
// and ImageObject / array forms for `image`. Bounds the recursion to keep
// pathological documents from blowing the stack.
//
// JSON-LD is untyped at the language level, so this file deliberately works
// with `unknown` and narrows defensively.
export function parseJsonLd($: CheerioAPI, finalUrl: string): Partial<ScrapeResult> {
	const products: Array<Record<string, unknown>> = []
	$('script[type="application/ld+json"]').each((_, el) => {
		const txt = $(el).contents().text()
		if (!txt) return
		try {
			const parsed: unknown = JSON.parse(txt)
			collectProducts(parsed, products, 0)
		} catch {
			// Some retailers ship invalid JSON-LD; ignore and move on.
		}
	})
	if (products.length === 0) return {}

	const result: Partial<ScrapeResult> = {}
	const product = products[0]
	const name = stringField(product['name'])
	if (name) result.title = name
	const description = stringField(product['description'])
	if (description) result.description = description

	const offers = product['offers']
	const offer = pickOffer(offers)
	if (offer) {
		const price = stringField(offer['price']) ?? numberField(offer['price'])
		if (price) result.price = price
		const currency = stringField(offer['priceCurrency'])
		if (currency) result.currency = currency
	}

	const imageUrls = collectImageUrls(product['image'], finalUrl)
	if (imageUrls.length) result.imageUrls = imageUrls

	return result
}

const MAX_NODES = 200

function collectProducts(node: unknown, out: Array<Record<string, unknown>>, depth: number): void {
	if (depth > 8 || out.length > 16) return
	if (!node || typeof node !== 'object') return
	if (Array.isArray(node)) {
		for (const item of node.slice(0, MAX_NODES)) collectProducts(item, out, depth + 1)
		return
	}
	const obj = node as Record<string, unknown>
	const graph = obj['@graph']
	if (Array.isArray(graph)) {
		for (const item of graph.slice(0, MAX_NODES)) collectProducts(item, out, depth + 1)
	}
	const types = stringList(obj['@type'])
	if (types.includes('Product')) out.push(obj)
}

function pickOffer(offers: unknown): Record<string, unknown> | undefined {
	if (!offers) return undefined
	if (Array.isArray(offers)) {
		for (const candidate of offers) {
			if (candidate && typeof candidate === 'object') return candidate as Record<string, unknown>
		}
		return undefined
	}
	if (typeof offers === 'object') return offers as Record<string, unknown>
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
