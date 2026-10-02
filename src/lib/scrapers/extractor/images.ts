import { amazonImageId } from './amazon'

// Image candidate filtering and ordering. The extractor preserves source-
// priority order (OG → JSON-LD → microdata → heuristic) when merging image
// URL lists, so this layer only has to drop obvious junk and break ties
// using URL-pattern hints.

const TRACKER_HOSTS: Array<string> = [
	'doubleclick.net',
	'googletagmanager.com',
	'google-analytics.com',
	'facebook.com/tr',
	'scorecardresearch.com',
	'adservice.',
	'pixel.',
	'tracker.',
	'segment.io',
	'mixpanel.com',
	'hotjar.com',
	'fullstory.com',
	'mc.yandex.',
	'bat.bing.com',
]

// Filenames that are almost always 1x1 transparent pixels regardless of
// extension. Match the *basename* exactly (token + image extension); a path
// like /products/blank-tshirt.jpg would not match.
const PIXEL_BASENAMES_RX = /^(?:pixel|spacer|blank|transparent|clear|shim|dot|beacon|trk|1x1)\.(?:gif|png|jpe?g|webp|svg)$/i

// Path segments that imply a tracking endpoint (often serving 1x1 images).
const TRACKER_PATH_RX = /\/(?:track(?:ing)?|beacon|collect|telemetry|metric[s]?|stats|analytics|impression|imp)(?:[/?]|$)/i

// "1x1" as a discrete token in the URL (anchored by separators or extension).
const ONE_BY_ONE_TOKEN_RX = /(?:^|[/_-])1x1(?=[._/?-]|$)/i

const NON_PRODUCT_PATH_HINTS: Array<RegExp> = [
	/\/logo[._-]/i,
	/[._-]logo[._-]/i,
	/\/sprite[s]?[/_.-]/i,
	/[._-]sprite[._-]/i,
	/\/icons?[/._-]/i,
	/[/_.-]icon[._-]/i,
	/\/favicon\b/i,
]

// URL-fragment hints that imply a *larger* variant of the same asset. Used
// to break ties when two candidates plausibly point at the same image.
const SIZE_HINTS_RX = /(?:[._-](?:large|xl|xxl|hires|hi-res|original|full|orig)\b)|(?:@2x)|(?:[?&](?:w|width)=(\d{3,5}))/i

export function filterAndSortImages(urls: ReadonlyArray<string>): Array<string> {
	const seen = new Set<string>()
	const surviving: Array<string> = []
	for (const raw of urls) {
		const url = raw.trim()
		if (!url) continue
		if (seen.has(url)) continue
		if (isInlineOrScriptUrl(url)) continue
		if (looksLikeTrackingPixel(url)) continue
		if (isNonProduct(url)) continue
		if (!hasUsableExtension(url)) continue
		seen.add(url)
		surviving.push(url)
	}
	return collapseSizeVariants(surviving)
}

// `data:` placeholders (lazy-load 1x1 GIFs), `blob:` and `javascript:` URLs
// are never a usable product image, and a 1x1 GIF slipping through as the
// first candidate is exactly what the form would pre-select.
function isInlineOrScriptUrl(url: string): boolean {
	return /^(?:data|blob|javascript):/i.test(url)
}

// Quality class of an image candidate, used by scoring. URL-only: we never
// download the image to measure it.
//   - photo: a real product photo
//   - share-card: Amazon's social-share composite (the product padded onto a
//     wide banner, sometimes with a promo badge)
//   - thumbnail: declared or URL-hinted at 160px or smaller
export type ImageClass = 'photo' | 'share-card' | 'thumbnail'

const THUMBNAIL_MAX_PX = 160
const AMAZON_SHARE_CARD_RX = /socialshare|_SR1910,1000|_BO\d+,255,255,255_/i
// Amazon size modifiers: _US100_, _SX300_, _SY679_, _SS40_, _SL1500_, _UL320_.
const AMAZON_SIZE_RX = /_(?:US|SX|SY|SS|SL|UL)(\d{2,4})_/gi
const QUERY_WIDTH_RX = /[?&](?:w|width)=(\d{1,5})(?:&|$)/i
// Shopify-style `_100x100.jpg` / `_120x.jpg` suffixes.
const DIMENSION_SUFFIX_RX = /_(\d{2,4})x(\d{0,4})(?:@\dx)?\.[a-z0-9]+(?:\?|$)/i

export function classifyImageUrl(url: string): ImageClass {
	if (amazonImageId(url)) {
		if (AMAZON_SHARE_CARD_RX.test(url)) return 'share-card'
		const sizes = [...url.matchAll(AMAZON_SIZE_RX)].map(m => Number(m[1]))
		if (sizes.length > 0 && Math.max(...sizes) <= THUMBNAIL_MAX_PX) return 'thumbnail'
		return 'photo'
	}
	const queryWidth = QUERY_WIDTH_RX.exec(url)
	if (queryWidth && Number(queryWidth[1]) <= THUMBNAIL_MAX_PX) return 'thumbnail'
	const suffix = DIMENSION_SUFFIX_RX.exec(url)
	if (suffix) {
		const dims = [suffix[1], suffix[2]].filter(Boolean).map(Number)
		if (dims.length > 0 && Math.max(...dims) <= THUMBNAIL_MAX_PX) return 'thumbnail'
	}
	return 'photo'
}

const CLASS_RANK: Record<ImageClass, number> = { photo: 3, 'share-card': 2, thumbnail: 1 }

// Best class among usable candidates (trackers and inline URLs skipped), or
// undefined when there is no usable image at all.
export function bestImageClass(urls: ReadonlyArray<string>): ImageClass | undefined {
	let best: ImageClass | undefined
	for (const raw of urls) {
		const url = raw.trim()
		if (!url || isInlineOrScriptUrl(url) || looksLikeTrackingPixel(url)) continue
		const cls = classifyImageUrl(url)
		if (!best || CLASS_RANK[cls] > CLASS_RANK[best]) best = cls
		if (best === 'photo') break
	}
	return best
}

export function looksLikeTrackingPixel(url: string): boolean {
	const lower = url.toLowerCase()
	if (TRACKER_HOSTS.some(t => lower.includes(t))) return true
	if (ONE_BY_ONE_TOKEN_RX.test(url)) return true
	if (hasOneByOneDims(url)) return true
	const path = pathOf(url)
	if (TRACKER_PATH_RX.test('/' + path)) return true
	const basename = path.split('/').pop() ?? ''
	if (PIXEL_BASENAMES_RX.test(basename)) return true
	return false
}

function hasOneByOneDims(url: string): boolean {
	try {
		const params = new URL(url).searchParams
		const w = params.get('w') ?? params.get('width')
		const h = params.get('h') ?? params.get('height')
		return w === '1' && h === '1'
	} catch {
		return false
	}
}

// Amazon's image CDNs serve product photos under /images/I/ and site chrome
// (warranty icons, store banners, badges) under /images/G/. Video
// thumbnails are product-image ids with a play-button overlay modifier.
const AMAZON_IMAGE_HOST_RX = /^(?:m\.media-amazon\.com|images-(?:na|eu|fe)\.ssl-images-amazon\.com)\//i
const AMAZON_NON_PRODUCT_RX = /^[^/]+\/images\/G\/|PKplay/i

function isNonProduct(url: string): boolean {
	const path = pathOf(url)
	if (AMAZON_IMAGE_HOST_RX.test(path) && AMAZON_NON_PRODUCT_RX.test(path)) return true
	return NON_PRODUCT_PATH_HINTS.some(rx => rx.test(path))
}

function hasUsableExtension(url: string): boolean {
	// Accept JPEG/PNG/WEBP/AVIF as primary product image formats; SVGs are
	// almost always icons or logos so we exclude them. Some retailers serve
	// images without an extension (e.g. /image/12345?w=600); accept those by
	// treating "no extension" as unknown rather than rejecting.
	const path = pathOf(url).toLowerCase()
	if (/\.svg(\?|$)/.test(path)) return false
	if (/\.gif(\?|$)/.test(path)) return false
	if (/\.(?:jpe?g|png|webp|avif|tiff?)(\?|$)/.test(path)) return true
	return !/\.[a-z0-9]{2,5}(\?|$)/.test(path)
}

function pathOf(url: string): string {
	try {
		const parsed = new URL(url)
		return parsed.hostname + parsed.pathname
	} catch {
		return url
	}
}

// If two URLs are clearly variants of the same asset (e.g. /img/foo.jpg vs
// /img/foo_large.jpg, or differ only by a `?w=NNN` query param), keep the
// "bigger" one and drop the other. Within true-duplicates, source order
// wins, so the higher-priority parser's URL stays.
function collapseSizeVariants(urls: ReadonlyArray<string>): Array<string> {
	type Slot = { key: string; chosen: string; chosenScore: number }
	const slots: Array<Slot> = []
	for (const url of urls) {
		const key = canonicalKey(url)
		const score = sizeScore(url)
		const existing = slots.find(s => s.key === key)
		if (!existing) {
			slots.push({ key, chosen: url, chosenScore: score })
			continue
		}
		if (score > existing.chosenScore) {
			existing.chosen = url
			existing.chosenScore = score
		}
	}
	return slots.map(s => s.chosen)
}

function canonicalKey(url: string): string {
	// Amazon serves one asset under many size/crop/overlay modifiers (the
	// share card, the 1500px original, 40-300px thumbnails). They are all
	// the same photo, and source order already puts the best one first.
	const amazonId = amazonImageId(url)
	if (amazonId) return `amazon-image:${amazonId}`
	try {
		const u = new URL(url)
		// Strip the size hints from the path (e.g. _large, @2x) and from common
		// width/height query params. Whatever's left is the asset identity.
		const path = u.pathname
			.replace(/[._-](?:large|xl|xxl|hires|hi-res|original|full|orig)(\.[a-z0-9]+)$/i, '$1')
			.replace(/@2x(\.[a-z0-9]+)$/i, '$1')
		return u.hostname + path
	} catch {
		return url
	}
}

function sizeScore(url: string): number {
	const m = SIZE_HINTS_RX.exec(url)
	if (!m) return 0
	const widthGroup = m[1]
	if (widthGroup) return Number(widthGroup) || 1
	return 1000
}
