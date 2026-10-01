import type { CheerioAPI } from 'cheerio'

import type { ScrapeResult } from '../types'
import { parsePriceText } from './heuristics'
import { resolveUrl } from './url-utils'

// Amazon product pages ship no JSON-LD and no OG price, and their og:image
// is a 1910x1000 social-share card (the product padded onto a banner). The
// real data lives in Amazon's own markup:
//   - price: the "price to pay" block in #corePrice_feature_div, plus a few
//     hidden inputs that carry the same number
//   - photo: #landingImage[data-old-hires] (the ~1500px original), with the
//     data-a-dynamic-image size map as a fallback
//
// This layer runs first in the extractor so the real photo ranks ahead of
// the share card. It only fires on Amazon hosts and only returns title
// (#productTitle, which never carries the "Amazon.com:" prefix that <title>
// does), price, currency, and images; description and rating stay with the
// generic layers.
//
// Amazon serves the price block empty to crawler user agents
// (facebookexternalhit), so the fetch provider tries a browser UA first on
// these hosts. See `providers/fetch.ts`.

// amazon.com, amazon.co.uk, smile.amazon.de, ... plus the short-link hosts
// that redirect into them.
const AMAZON_HOST_RE =
	/(?:^|\.)amazon\.(?:com|ca|com\.mx|com\.br|co\.uk|de|fr|it|es|nl|se|pl|com\.be|com\.tr|ae|sa|eg|in|sg|co\.jp|com\.au)$/i
const AMAZON_SHORT_HOSTS = new Set(['amzn.to', 'amzn.com', 'www.amzn.com', 'a.co'])

export function isAmazonUrl(url: string): boolean {
	let host: string
	try {
		host = new URL(url).hostname.toLowerCase()
	} catch {
		return false
	}
	return AMAZON_HOST_RE.test(host) || AMAZON_SHORT_HOSTS.has(host)
}

// Ordered strongest first. The "price to pay" spans hold the price the
// buyer actually pays (deal price when there is one, never the struck-out
// list price). The legacy priceblock ids still show up on older layouts.
const PRICE_TEXT_SELECTORS = [
	'#corePrice_feature_div .apex-pricetopay-value .a-offscreen',
	'#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen',
	'#corePriceDisplay_desktop_feature_div [data-pricetopay-label]',
	'.apex-pricetopay-value .a-offscreen',
	'#corePrice_feature_div .a-price .a-offscreen',
	'#priceblock_dealprice',
	'#priceblock_saleprice',
	'#priceblock_ourprice',
	'#price_inside_buybox',
	'#newBuyBoxPrice',
	'#kindle-price',
]

// Hidden inputs carrying the bare number (no currency symbol).
const PRICE_VALUE_SELECTORS = ['input#attach-base-product-price', 'input#priceValue']

// Image blocks, main product first, then the book-cover variants.
const HERO_IMAGE_SELECTORS = ['#landingImage', '#imgBlkFront', '#ebooksImgBlkFront', '#main-image']

export function parseAmazon($: CheerioAPI, finalUrl: string): Partial<ScrapeResult> {
	if (!isAmazonUrl(finalUrl)) return {}
	const result: Partial<ScrapeResult> = {}

	const title = $('#productTitle').first().text().replace(/\s+/g, ' ').trim()
	if (title) result.title = title

	const price = findPrice($)
	if (price.price) {
		result.price = price.price
		if (price.currency) result.currency = price.currency
	}

	const images: Array<string> = []
	const hero = findHeroImage($, finalUrl)
	if (hero) images.push(hero)
	for (const url of findGalleryImages($, finalUrl)) {
		const id = amazonImageId(url)
		if (id && images.some(existing => amazonImageId(existing) === id)) continue
		images.push(url)
	}
	if (images.length) result.imageUrls = images

	return result
}

function findPrice($: CheerioAPI): { price?: string; currency?: string } {
	for (const sel of PRICE_TEXT_SELECTORS) {
		for (const el of $(sel).toArray()) {
			const parsed = parsePriceText($(el).text())
			if (parsed?.price && isPositive(parsed.price)) return parsed
		}
	}
	for (const sel of PRICE_VALUE_SELECTORS) {
		const value = $(sel).first().attr('value')?.trim()
		if (!value) continue
		const parsed = parsePriceText(value)
		if (parsed?.price && isPositive(parsed.price)) {
			// The bare-number inputs sit next to a #priceSymbol input.
			const symbol = $('input#priceSymbol').first().attr('value')?.trim()
			const withSymbol = symbol ? parsePriceText(`${symbol}${parsed.price}`) : null
			return { price: parsed.price, currency: withSymbol?.currency ?? parsed.currency }
		}
	}
	return {}
}

function isPositive(price: string): boolean {
	const n = Number(price)
	return Number.isFinite(n) && n > 0
}

function findHeroImage($: CheerioAPI, finalUrl: string): string | undefined {
	for (const sel of HERO_IMAGE_SELECTORS) {
		const el = $(sel).first()
		if (el.length === 0) continue
		const hires = el.attr('data-old-hires')?.trim()
		if (hires && /^https?:\/\//i.test(hires)) return resolveUrl(hires, finalUrl)
		const largest = largestDynamicImage(el.attr('data-a-dynamic-image'))
		if (largest) return resolveUrl(largest, finalUrl)
	}
	return undefined
}

// The #altImages strip holds 40-100px thumbnails of every gallery photo.
// Amazon's image CDN resizes on request, so the same asset id with an
// `_AC_SL1500_` modifier is the full-size photo (capped at 1500px on the
// long side, never upscaled). Video thumbnails are skipped.
const MAX_GALLERY_IMAGES = 8

function findGalleryImages($: CheerioAPI, finalUrl: string): Array<string> {
	const out: Array<string> = []
	for (const el of $('#altImages img').toArray()) {
		if (out.length >= MAX_GALLERY_IMAGES) break
		const node = $(el)
		if (node.closest('.videoThumbnail, .videoBlockIngress').length > 0) continue
		const src = node.attr('src')?.trim()
		if (!src || /PKplay/i.test(src)) continue
		const full = toFullSizeAmazonImage(resolveUrl(src, finalUrl))
		if (full && !out.includes(full)) out.push(full)
	}
	return out
}

// Matches an Amazon product-image URL on Amazon's image CDNs:
// /images/I/<id>[.<modifiers>].<ext>. The id names the asset; the
// modifiers only pick a size, crop, or overlay.
const AMAZON_IMAGE_RE =
	/^(https?:\/\/(?:m\.media-amazon\.com|images-(?:na|eu|fe)\.ssl-images-amazon\.com)\/images\/I\/)([A-Za-z0-9+%-]+)(?:\.[^/]*?)?\.(jpe?g|png|webp)$/i

function toFullSizeAmazonImage(url: string): string | undefined {
	const m = AMAZON_IMAGE_RE.exec(url)
	if (!m) return undefined
	return `${m[1]}${m[2]}._AC_SL1500_.${m[3].toLowerCase()}`
}

export function amazonImageId(url: string): string | undefined {
	return AMAZON_IMAGE_RE.exec(url)?.[2]
}

// `data-a-dynamic-image` is a JSON map of URL -> [height, width]. Pick the
// biggest by area.
function largestDynamicImage(raw: string | undefined): string | undefined {
	if (!raw) return undefined
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		return undefined
	}
	if (!parsed || typeof parsed !== 'object') return undefined
	let best: { url: string; area: number } | undefined
	for (const [url, dims] of Object.entries(parsed as Record<string, unknown>)) {
		if (!/^https?:\/\//i.test(url)) continue
		const area = Array.isArray(dims) && dims.length >= 2 ? Number(dims[0]) * Number(dims[1]) : 0
		if (!best || (Number.isFinite(area) && area > best.area)) best = { url, area: Number.isFinite(area) ? area : 0 }
	}
	return best?.url
}
