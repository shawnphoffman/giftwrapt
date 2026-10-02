// Detects a product link that no longer leads to a product: the store
// redirected the requested page to its homepage (or a locale homepage, or a
// "store closed" password page). Stores do this when a product is deleted.
// The page still loads and extracts a title and photos, but they describe
// the store, not the item, so the orchestrator ends the scrape as
// `dead-link` instead of prefilling the form with them. A real browser
// gets the same redirect, so the paid tiers are not tried either.
//
// Only a redirect counts: a URL that was already a homepage is a normal
// scrape (people do paste store homepages).

// `/`, `/index.html`, `/home`, `/password`, and locale roots like `/en`,
// `/en-us`, `/fr_ca` (trailing slash optional).
const HOMEPAGE_PATH_RX = /^\/(?:|index\.(?:html?|php)|home|password|[a-z]{2}(?:[-_][a-z]{2})?)\/?$/i

export function isHomepagePath(pathname: string): boolean {
	return HOMEPAGE_PATH_RX.test(pathname)
}

export function isDeadLinkRedirect(requestedUrl: string, finalUrl: string | undefined): boolean {
	if (!finalUrl) return false
	let requested: URL
	let final: URL
	try {
		requested = new URL(requestedUrl)
		final = new URL(finalUrl)
	} catch {
		return false
	}
	if (isHomepagePath(requested.pathname)) return false
	return isHomepagePath(final.pathname)
}
