// Pure parser for the "paste plain URLs" import source.
//
// Input is a textarea blob (one URL per line, with arbitrary whitespace).
// Output is one `ItemDraft` per accepted URL: title left blank, url set,
// everything else null. The background scrape queue fills the rest in
// after the bulk insert lands.
//
// Acceptance rules:
//   - Strip whitespace; drop empty lines.
//   - Only http: and https: schemes are kept. mailto:, javascript:, ftp:,
//     and bare strings (no scheme + no `://`) are dropped silently. The
//     paste source is meant for product URLs, not arbitrary identifiers.
//   - De-dupe by canonical URL (preserve first occurrence). Two URLs that
//     differ only in trailing slash collapse to the first.

import type { ItemDraft } from '@/api/import'

const ALLOWED_SCHEMES = new Set(['http:', 'https:'])

function canonical(url: URL): string {
	// Drop a trailing slash on the path (but keep "/" for root) so
	// `https://x.com/foo` and `https://x.com/foo/` collapse. Hash and
	// query are preserved as-is; they distinguish products on many
	// retailers.
	const u = new URL(url.toString())
	if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
		u.pathname = u.pathname.replace(/\/+$/, '')
	}
	return u.toString()
}

export function parseUrls(input: string): Array<ItemDraft> {
	const seen = new Set<string>()
	const out: Array<ItemDraft> = []
	for (const rawLine of input.split(/\r?\n/)) {
		const line = rawLine.trim()
		if (line.length === 0) continue
		let parsed: URL
		try {
			parsed = new URL(line)
		} catch {
			continue
		}
		if (!ALLOWED_SCHEMES.has(parsed.protocol)) continue
		const key = canonical(parsed)
		if (seen.has(key)) continue
		seen.add(key)
		out.push({
			title: null,
			url: parsed.toString(),
			price: null,
			currency: null,
			imageUrl: null,
			notes: null,
		})
	}
	return out
}
