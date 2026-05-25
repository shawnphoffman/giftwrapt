import type { CheerioAPI } from 'cheerio'

import type { ScrapeResult } from '../types'

// Vocabulary allowlist for purchase-choice axes. A candidate axis name must
// contain at least one of these words (case-insensitive substring match) to
// survive filtering. Anything else (e.g. "Email me about restock",
// "Subscription frequency") is dropped.
const VOCABULARY = [
	'size',
	'color',
	'colour',
	'material',
	'style',
	'flavor',
	'flavour',
	'length',
	'width',
	'height',
	'depth',
	'pattern',
	'finish',
	'option',
	'variant',
	'scent',
	'fit',
	'capacity',
	'configuration',
	'model',
	'edition',
	'format',
	'quantity',
	'pack',
	'bundle',
] as const

const MAX_AXES = 6

// JSON-LD walk bounds (mirror json-ld.ts to keep pathological pages cheap).
const MAX_DEPTH = 12
const MAX_PRODUCTS = 32
const MAX_ARRAY = 200

// Extracts the names of purchase-choice axes the buyer must pick (e.g.
// "Color", "Size"). Two signal sources, unioned and deduped case-
// insensitively (first casing seen, Title-Cased for output), capped at
// MAX_AXES:
//   - JSON-LD: Product.additionalProperty[].name, plus the same field on
//     hasVariant[] and offers[].itemOffered.
//   - HTML form heuristics: <select> + <label>/aria-label/name/id,
//     radio groups via <fieldset><legend> or role="radiogroup"+aria-label,
//     swatch elements via data-option-name / data-attribute-name /
//     data-swatch-type.
//
// Returns `{ purchaseVariants: [...] }` when at least one axis was found;
// returns `{}` when none. (The extractor merge in index.ts treats a
// missing key as "this layer contributed nothing.")
export function parseAxes($: CheerioAPI, _finalUrl: string): Partial<ScrapeResult> {
	const candidates: Array<string> = []

	collectFromJsonLd($, candidates)
	collectFromHtmlHeuristics($, candidates)

	const seen = new Set<string>()
	const out: Array<string> = []
	for (const raw of candidates) {
		if (!raw) continue
		const normalized = raw.trim()
		if (!normalized) continue
		if (!matchesVocabulary(normalized)) continue
		const key = normalized.toLowerCase()
		if (seen.has(key)) continue
		seen.add(key)
		out.push(titleCase(normalized))
		if (out.length >= MAX_AXES) break
	}

	if (out.length === 0) return {}
	return { purchaseVariants: out }
}

function matchesVocabulary(name: string): boolean {
	const lower = name.toLowerCase()
	return VOCABULARY.some(v => lower.includes(v))
}

function titleCase(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
		.join(' ')
}

function collectFromJsonLd($: CheerioAPI, out: Array<string>): void {
	const products: Array<Record<string, unknown>> = []
	$('script[type="application/ld+json"]').each((_, el) => {
		const txt = $(el).contents().text()
		if (!txt) return
		try {
			const parsed: unknown = JSON.parse(txt)
			walk(parsed, products, 0)
		} catch {
			// Some retailers ship invalid JSON-LD; ignore and move on.
		}
	})
	for (const product of products) {
		collectAdditionalPropertyNames(product['additionalProperty'], out)
		const variants = product['hasVariant']
		const variantList = Array.isArray(variants) ? variants : variants ? [variants] : []
		for (const v of variantList) {
			if (v && typeof v === 'object') {
				collectAdditionalPropertyNames((v as Record<string, unknown>)['additionalProperty'], out)
			}
		}
		const offers = product['offers']
		const offerList = Array.isArray(offers) ? offers : offers ? [offers] : []
		for (const o of offerList) {
			if (o && typeof o === 'object') {
				const itemOffered = (o as Record<string, unknown>)['itemOffered']
				const itemOfferedList = Array.isArray(itemOffered) ? itemOffered : itemOffered ? [itemOffered] : []
				for (const i of itemOfferedList) {
					if (i && typeof i === 'object') {
						collectAdditionalPropertyNames((i as Record<string, unknown>)['additionalProperty'], out)
					}
				}
			}
		}
	}
}

function collectAdditionalPropertyNames(node: unknown, out: Array<string>): void {
	if (!node) return
	const list = Array.isArray(node) ? node : [node]
	for (const entry of list) {
		if (!entry || typeof entry !== 'object') continue
		const name = (entry as Record<string, unknown>)['name']
		if (typeof name === 'string' && name.trim()) out.push(name.trim())
	}
}

function walk(node: unknown, products: Array<Record<string, unknown>>, depth: number): void {
	if (depth > MAX_DEPTH || products.length > MAX_PRODUCTS) return
	if (!node || typeof node !== 'object') return
	if (Array.isArray(node)) {
		for (let i = 0; i < node.length && i < MAX_ARRAY; i++) walk(node[i], products, depth + 1)
		return
	}
	const obj = node as Record<string, unknown>
	const types = stringList(obj['@type'])
	if (types.includes('Product')) products.push(obj)
	for (const value of Object.values(obj)) walk(value, products, depth + 1)
}

function stringList(value: unknown): Array<string> {
	if (typeof value === 'string') return [value]
	if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
	return []
}

function collectFromHtmlHeuristics($: CheerioAPI, out: Array<string>): void {
	// <select>: <label for=...> wins, then aria-label, then name/id (with
	// underscores/dashes coerced to spaces).
	$('select').each((_, el) => {
		const $el = $(el)
		const id = $el.attr('id')
		let label: string | undefined
		if (id) {
			const labelText = $(`label[for="${escapeSelector(id)}"]`)
				.first()
				.text()
				.trim()
			if (labelText) label = labelText
		}
		if (!label) {
			const aria = $el.attr('aria-label')?.trim()
			if (aria) label = aria
		}
		if (!label) {
			const attr = $el.attr('name') ?? $el.attr('id')
			if (attr) label = humanizeAttr(attr)
		}
		if (label) out.push(label)
	})

	// Radio groups: <fieldset> with a <legend>, or any container with
	// role="radiogroup" + aria-label.
	$('fieldset').each((_, el) => {
		const $el = $(el)
		const legend = $el.children('legend').first().text().trim()
		if (legend) out.push(legend)
	})
	$('[role="radiogroup"]').each((_, el) => {
		const aria = $(el).attr('aria-label')?.trim()
		if (aria) out.push(aria)
	})

	// Swatch-style elements: any of three data-* attrs carries the axis name.
	$('[data-option-name]').each((_, el) => {
		const v = $(el).attr('data-option-name')?.trim()
		if (v) out.push(v)
	})
	$('[data-attribute-name]').each((_, el) => {
		const v = $(el).attr('data-attribute-name')?.trim()
		if (v) out.push(v)
	})
	$('[data-swatch-type]').each((_, el) => {
		const v = $(el).attr('data-swatch-type')?.trim()
		if (v) out.push(v)
	})
}

function humanizeAttr(value: string): string {
	return value.replace(/[_-]+/g, ' ').trim()
}

// Cheerio attribute selectors choke on bare punctuation in the value.
// Backslash-escape the CSS specials we're likely to encounter in real ids.
function escapeSelector(value: string): string {
	return value.replace(/(["\\\]])/g, '\\$1')
}
