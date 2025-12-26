export type DomainConfig = {
	/** Regex pattern to match the domain (will be tested against the hostname) */
	pattern: RegExp | string
	/** Display name for the domain */
	name: string
}

/**
 * Configuration for common domains.
 * Patterns are tested against the hostname (without www. prefix).
 * Can be extended or made configurable later.
 */
const commonDomains: Array<DomainConfig> = [
	{ pattern: /^a\.co$/, name: 'Amazon' },
	{ pattern: /^amazon\.(com|ca|co\.uk|de|fr|it|es|jp|in|com\.au|com\.mx|nl|se|pl|com\.br)$/, name: 'Amazon' },
	{ pattern: /^etsy\.com$/, name: 'Etsy' },
	{ pattern: /^facebook\.com$/, name: 'Facebook' },
	{ pattern: /^shopify\.com$/, name: 'Shopify' },
	{ pattern: /^jcrew\.com$/, name: 'J.Crew' },
	{ pattern: /^loft\.com$/, name: 'Loft' },
	{ pattern: /^walmart\.com$/, name: 'Walmart' },
	{ pattern: /^target\.com$/, name: 'Target' },
	{ pattern: /^ebay\.com$/, name: 'eBay' },
	{ pattern: /^bestbuy\.com$/, name: 'Best Buy' },
	{ pattern: /^apple\.com$/, name: 'Apple' },
	{ pattern: /^microsoft\.com$/, name: 'Microsoft' },
	{ pattern: /^google\.com$/, name: 'Google' },
	{ pattern: /^nike\.com$/, name: 'Nike' },
	{ pattern: /^adidas\.com$/, name: 'Adidas' },
]

/**
 * Extracts a clean domain name from a URL.
 * Returns a friendly name for common domains (e.g., "Amazon" for amazon.com),
 * or capitalizes the domain name for unknown domains.
 *
 * @param url - The URL to extract the domain from
 * @returns A clean, readable domain name
 */
export function getDomainFromUrl(url: string): string {
	try {
		const parsedUrl = new URL(url)
		const hostname = parsedUrl.hostname

		if (!hostname) {
			return ''
		}

		// Remove 'www.' prefix if present
		const cleanHostname = hostname.replace(/^www\./, '')

		// Check if any domain pattern matches
		for (const domainConfig of commonDomains) {
			const pattern = typeof domainConfig.pattern === 'string' ? new RegExp(domainConfig.pattern) : domainConfig.pattern
			if (pattern.test(cleanHostname)) {
				return domainConfig.name
			}
		}

		// For unknown domains, extract the main domain and capitalize it
		const parts = cleanHostname.split('.')
		let domain: string

		if (parts.length > 2) {
			// For subdomains, take the last two parts (e.g., "example.com" from "sub.example.com")
			domain = parts.slice(-2).join('.')
		} else {
			domain = cleanHostname
		}

		// Capitalize the first letter of each word
		return domain
			.split('.')
			.map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
			.join('.')
	} catch (error) {
		// If URL parsing fails, try to extract domain manually
		try {
			const match = url.match(/^(?:https?:\/\/)?(?:www\.)?([^/]+)/i)
			if (match && match[1]) {
				const domain = match[1].split('.')
				if (domain.length > 1) {
					const mainDomain = domain.slice(-2).join('.')
					return mainDomain
						.split('.')
						.map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
						.join('.')
				}
			}
		} catch {
			// Fallback: return empty string
		}
		return ''
	}
}
