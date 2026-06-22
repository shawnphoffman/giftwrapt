import type { CheerioAPI } from 'cheerio'

import type { ScrapeResult } from '../types'

// Vocabulary allowlist for purchase-choice axes. A candidate axis name must
// contain at least one of these words (case-insensitive substring match) to
// survive filtering. Anything else (e.g. "Email me about restock",
// "Subscription frequency") is dropped.
//
// Pure dimensional / packaging words (length, width, height, depth, weight,
// quantity, pack, bundle) are deliberately absent: they're spec-sheet words,
// not buyer choices. Their presence is what let rows like "Bar Length
// (inches)" and "Package Quantity" leak into the notes prefill from a
// retailer's spec table. The words kept here (capacity, configuration,
// model, edition, format) are dual-use but only reach the filter via genuine
// variant signals now (form controls or value-varying variant data), where
// they're legitimate axes (storage capacity, console edition, book format).
const VOCABULARY = [
	'size',
	'color',
	'colour',
	'material',
	'style',
	'flavor',
	'flavour',
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
//   - JSON-LD: the canonical variant signals only. ProductGroup.variesBy[]
//     (the axis names a group varies by) and value-varying properties across
//     hasVariant[] / offers[].itemOffered - a property is an axis only when
//     its value actually differs across two or more variants/offers. We do
//     NOT read top-level Product.additionalProperty: that's schema.org's
//     generic spec bag (dimensions, weights, package info), not a set of
//     buyer choices, and treating it as axes is what leaked spec rows like
//     "Bar Length (inches)" into the notes prefill. The value-variance rule
//     keeps a real axis ("Color": Red/Blue) and drops a constant spec
//     ("Weight": 5 lb) even when both ride along inside variant data.
//   - HTML form heuristics: Amazon twister blocks
//     (div[id^="variation_"][id$="_name"]), <select> + <label>/aria-label/
//     name/id (skipping name|id="quantity", which is the cart counter, not
//     a product variant), radio groups via <fieldset><legend> or
//     role="radiogroup"+aria-label, swatch elements via data-option-name /
//     data-attribute-name / data-swatch-type.
//
// Trailing punctuation on collected labels (e.g. "Color:") is stripped
// before vocabulary matching so the rendered note bullet reads "- Color: "
// and not "- Color:: ".
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
		const normalized = stripTrailingPunctuation(raw)
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

	// Pass 1: ProductGroup.variesBy is the explicit, canonical axis list.
	for (const product of products) {
		collectVariesBy(product['variesBy'], out)
	}

	// Pass 2: infer axes from variant/offer data. Tally each property's
	// distinct values across every variant + offered item, then keep only the
	// names whose value actually varies (size >= 2) - those are the choices a
	// buyer makes; a property with one constant value is a spec, not an axis.
	const valuesByName = new Map<string, { display: string; values: Set<string> }>()
	for (const product of products) {
		for (const node of variantNodesOf(product)) {
			tallyVariantProperties(node['additionalProperty'], valuesByName)
		}
	}
	for (const { display, values } of valuesByName.values()) {
		if (values.size >= 2) out.push(display)
	}
}

// Every Product node reachable as a variant or offered item of `product`.
function variantNodesOf(product: Record<string, unknown>): Array<Record<string, unknown>> {
	const nodes: Array<Record<string, unknown>> = []
	const variants = product['hasVariant']
	for (const v of Array.isArray(variants) ? variants : variants ? [variants] : []) {
		if (v && typeof v === 'object') nodes.push(v as Record<string, unknown>)
	}
	const offers = product['offers']
	for (const o of Array.isArray(offers) ? offers : offers ? [offers] : []) {
		if (!o || typeof o !== 'object') continue
		const itemOffered = (o as Record<string, unknown>)['itemOffered']
		for (const i of Array.isArray(itemOffered) ? itemOffered : itemOffered ? [itemOffered] : []) {
			if (i && typeof i === 'object') nodes.push(i as Record<string, unknown>)
		}
	}
	return nodes
}

// Record each PropertyValue's value under its (case-insensitive) name so the
// caller can tell axes (multiple distinct values) from specs (one value).
// Entries without a usable value can't prove variance, so they're skipped.
function tallyVariantProperties(node: unknown, into: Map<string, { display: string; values: Set<string> }>): void {
	if (!node) return
	for (const entry of Array.isArray(node) ? node : [node]) {
		if (!entry || typeof entry !== 'object') continue
		const rec = entry as Record<string, unknown>
		const name = typeof rec['name'] === 'string' ? rec['name'].trim() : ''
		if (!name) continue
		const rawValue = rec['value']
		const value = typeof rawValue === 'string' ? rawValue.trim() : typeof rawValue === 'number' ? String(rawValue) : ''
		if (!value) continue
		const key = name.toLowerCase()
		const existing = into.get(key)
		if (existing) existing.values.add(value.toLowerCase())
		else into.set(key, { display: name, values: new Set([value.toLowerCase()]) })
	}
}

// ProductGroup.variesBy: a string or array of strings naming the axes. Values
// may be bare names ("color"), schema.org URLs, or "#"-fragments; take the
// trailing token so the vocabulary filter and title-casing see a clean name.
function collectVariesBy(node: unknown, out: Array<string>): void {
	if (!node) return
	for (const entry of Array.isArray(node) ? node : [node]) {
		if (typeof entry !== 'string') continue
		const trimmed = entry.trim()
		if (!trimmed) continue
		const token = trimmed.split(/[#/]/).filter(Boolean).pop() ?? trimmed
		const name = humanizeAttr(token)
		if (name) out.push(name)
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
	if (types.includes('Product') || types.includes('ProductGroup')) products.push(obj)
	for (const value of Object.values(obj)) walk(value, products, depth + 1)
}

function stringList(value: unknown): Array<string> {
	if (typeof value === 'string') return [value]
	if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
	return []
}

function collectFromHtmlHeuristics($: CheerioAPI, out: Array<string>): void {
	// Amazon "twister" variation blocks: `<div id="variation_color_name">` etc.
	// Prefer the human-visible label (`<label class="a-form-label">Color:</label>`);
	// fall back to the axis name baked into the id (`color`).
	$('div[id^="variation_"][id$="_name"]').each((_, el) => {
		const $el = $(el)
		const labelText = $el.find('label.a-form-label').first().text().trim()
		if (labelText) {
			out.push(labelText)
			return
		}
		const id = $el.attr('id') ?? ''
		const axis = id.replace(/^variation_/, '').replace(/_name$/, '')
		if (axis) out.push(humanizeAttr(axis))
	})

	// <select>: <label for=...> wins, then aria-label, then name/id (with
	// underscores/dashes coerced to spaces). Skip cart-quantity widgets
	// (`<select name="quantity">` / `id="quantity"`), which are the buyer's
	// cart count, not a product variant.
	$('select').each((_, el) => {
		const $el = $(el)
		const name = $el.attr('name')?.toLowerCase()
		const id = $el.attr('id')
		if (name === 'quantity' || id?.toLowerCase() === 'quantity') return
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

function stripTrailingPunctuation(value: string): string {
	return value.replace(/[\s:：\-–—]+$/u, '').trim()
}

// Cheerio attribute selectors choke on bare punctuation in the value.
// Backslash-escape the CSS specials we're likely to encounter in real ids.
function escapeSelector(value: string): string {
	return value.replace(/(["\\\]])/g, '\\$1')
}
