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
]

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
		if (looksLikeTrackingPixel(url)) continue
		if (isNonProduct(url)) continue
		if (!hasUsableExtension(url)) continue
		seen.add(url)
		surviving.push(url)
	}
	return collapseSizeVariants(surviving)
}

export function looksLikeTrackingPixel(url: string): boolean {
	const lower = url.toLowerCase()
	if (TRACKER_HOSTS.some(t => lower.includes(t))) return true
	if (/_1x1\b/i.test(url)) return true
	if (hasOneByOneDims(url)) return true
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

function isNonProduct(url: string): boolean {
	const path = pathOf(url)
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
