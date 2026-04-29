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
 * Backwards-compatible display helper. Returns the friendly vendor name
 * for the URL, or '' if the URL can't be parsed.
 */
export function getDomainFromUrl(url: string): string {
	return getVendorFromUrl(url)?.name ?? ''
}
