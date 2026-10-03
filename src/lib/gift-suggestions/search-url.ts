// The optional "Search" link on each gift suggestion.
//
// The app does not choose a search or shopping provider for anyone. The
// admin types a URL template with `{query}` where the idea's title should go
// (for example `https://www.google.com/search?q={query}` or a store's own
// search page), and each suggestion links there. Empty means no link.
//
// Only http(s) templates are accepted, so a saved value can never become a
// `javascript:` or other non-web link when rendered as an href.

export const SEARCH_QUERY_PLACEHOLDER = '{query}'
export const SEARCH_URL_MAX_LENGTH = 500

export function isValidSearchUrlTemplate(template: string): boolean {
	if (template.length > SEARCH_URL_MAX_LENGTH || !template.includes(SEARCH_QUERY_PLACEHOLDER)) return false
	try {
		const url = new URL(template.replaceAll(SEARCH_QUERY_PLACEHOLDER, 'test'))
		return url.protocol === 'https:' || url.protocol === 'http:'
	} catch {
		return false
	}
}

// The link for one idea, or null when there is no usable template.
export function buildSearchUrl(template: string | null, query: string): string | null {
	if (!template || !isValidSearchUrlTemplate(template)) return null
	return template.replaceAll(SEARCH_QUERY_PLACEHOLDER, encodeURIComponent(query.trim()))
}
