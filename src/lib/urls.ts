export type VendorInfo = {
	id: string
	name: string
}

type DomainConfig = {
	pattern: RegExp
	id: string
	name: string
}

const commonDomains: Array<DomainConfig> = [
	{ pattern: /^a\.co$/, id: 'amazon', name: 'Amazon' },
	{ pattern: /^amazon\.(com|ca|co\.uk|de|fr|it|es|jp|in|com\.au|com\.mx|nl|se|pl|com\.br)$/, id: 'amazon', name: 'Amazon' },
	{ pattern: /^etsy\.com$/, id: 'etsy', name: 'Etsy' },
	{ pattern: /^facebook\.com$/, id: 'facebook', name: 'Facebook' },
	{ pattern: /^shopify\.com$/, id: 'shopify', name: 'Shopify' },
	{ pattern: /^jcrew\.com$/, id: 'jcrew', name: 'J.Crew' },
	{ pattern: /^loft\.com$/, id: 'loft', name: 'Loft' },
	{ pattern: /^walmart\.com$/, id: 'walmart', name: 'Walmart' },
	{ pattern: /^target\.com$/, id: 'target', name: 'Target' },
	{ pattern: /^ebay\.com$/, id: 'ebay', name: 'eBay' },
	{ pattern: /^bestbuy\.com$/, id: 'bestbuy', name: 'Best Buy' },
	{ pattern: /^apple\.com$/, id: 'apple', name: 'Apple' },
	{ pattern: /^microsoft\.com$/, id: 'microsoft', name: 'Microsoft' },
	{ pattern: /^google\.com$/, id: 'google', name: 'Google' },
	{ pattern: /^nike\.com$/, id: 'nike', name: 'Nike' },
	{ pattern: /^adidas\.com$/, id: 'adidas', name: 'Adidas' },
]

const idToName = new Map(commonDomains.map(d => [d.id, d.name]))

function parseHostname(url: string): string | null {
	try {
		const hostname = new URL(url).hostname
		if (!hostname) return null
		return hostname.replace(/^www\./, '')
	} catch {
		const match = url.match(/^(?:https?:\/\/)?(?:www\.)?([^/]+)/i)
		const raw = match?.[1]
		if (!raw) return null
		return raw.toLowerCase()
	}
}

/**
 * Extracts a stable vendor identity from a URL.
 *
 * Returns `{ id, name }` for both known and unknown vendors so the id is
 * suitable as a persisted/filterable key:
 *   - Known rule match -> `{ id: 'amazon', name: 'Amazon' }`
 *   - Parseable but unknown -> `{ id: '<hostname>', name: '<Capitalized.Hostname>' }`
 *   - Unparseable / empty / null -> `null`
 */
export function getVendorFromUrl(url: string | null | undefined): VendorInfo | null {
	if (!url) return null
	const hostname = parseHostname(url)
	if (!hostname) return null

	for (const config of commonDomains) {
		if (config.pattern.test(hostname)) {
			return { id: config.id, name: config.name }
		}
	}

	const parts = hostname.split('.')
	const fallback = parts.length > 2 ? parts.slice(-2).join('.') : hostname
	return { id: fallback, name: fallback.toLowerCase() }
}

/**
 * Resolves a stored vendor id to a display name. Falls back to a
 * lowercase version of the id (which is itself a hostname for unknown
 * vendors), so this function never returns null.
 */
export function vendorIdToName(id: string): string {
	return idToName.get(id) ?? id.toLowerCase()
}

/**
 * True when the id corresponds to a curated rule in `commonDomains`
 * (e.g. 'amazon', 'etsy'). Unknown vendors fall back to a hostname id
 * and return false.
 */
export function isKnownVendor(id: string): boolean {
	return idToName.has(id)
}

/**
 * Backwards-compatible display helper. Returns the friendly vendor name
 * for the URL, or '' if the URL can't be parsed.
 */
export function getDomainFromUrl(url: string): string {
	return getVendorFromUrl(url)?.name ?? ''
}

/**
 * Returns a stable `host + path` key for two URLs to be compared as
 * "the same product page." Strips the scheme, leading `www.`, query
 * string, fragment, and any trailing slash. Hostname is lowercased;
 * path is preserved case-sensitively (Amazon-style ASIN paths can be
 * case-significant on some retailers).
 *
 * Returns `null` for empty/unparseable input. Two items whose URLs
 * normalize to the same non-null string are confidently the same
 * product page, regardless of what their titles say.
 */
export function normalizeProductUrl(url: string | null | undefined): string | null {
	if (!url) return null
	const trimmed = url.trim()
	if (!trimmed) return null
	let host: string | null = null
	let path = ''
	try {
		const u = new URL(trimmed)
		host = u.hostname.replace(/^www\./, '').toLowerCase()
		path = u.pathname
	} catch {
		const match = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?([^/?#]+)([^?#]*)/i)
		if (!match) return null
		host = match[1].toLowerCase()
		path = match[2]
	}
	if (!host) return null
	// Require a host that looks like a real hostname: at least one dot,
	// only domain-legal characters. Rejects garbage like `::::` or
	// `localhost` so two items with junk URLs don't get falsely paired.
	if (!/^[a-z0-9.-]+\.[a-z0-9-]+$/i.test(host)) return null
	if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
	if (!path) path = '/'
	return `${host}${path}`
}

const INTERNAL_LIST_PATH = /^\/lists\/(\d+)(?:\/|$)/

/**
 * Detects URLs that point at a list inside this app. Returns the listId
 * when the URL parses cleanly, its origin matches the passed origin, and
 * the path starts with /lists/<id>. Sub-routes (e.g. /edit), query
 * strings, and fragments are tolerated and ignored - the badge always
 * navigates to the canonical view route. This forgives URLs pasted from
 * the edit screen or with tracking params.
 *
 * Pass `window.location.origin` from the client. Falsy origin returns
 * null so SSR is a no-op.
 */
export function parseInternalListLink(url: string | null | undefined, origin: string | null | undefined): { listId: number } | null {
	if (!url || !origin) return null
	let parsed: URL
	try {
		parsed = new URL(url)
	} catch {
		return null
	}
	if (parsed.origin !== origin) return null
	const match = parsed.pathname.match(INTERNAL_LIST_PATH)
	if (!match) return null
	const listId = Number(match[1])
	if (!Number.isFinite(listId) || listId <= 0) return null
	return { listId }
}
