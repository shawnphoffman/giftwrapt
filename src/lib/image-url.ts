// Upgrade an `http://` image URL to `https://`. Browsers block mixed-content
// images on HTTPS pages with no CSP escape hatch, and most CDNs serve both
// schemes interchangeably, so this swap fixes deployed-only render gaps.
export function httpsUpgrade(url: string): string {
	if (url.startsWith('http://')) return 'https://' + url.slice('http://'.length)
	return url
}

export function httpsUpgradeOrNull(url: string | null | undefined): string | null {
	if (!url) return null
	return httpsUpgrade(url)
}
