// Parse a multiline `Header-Name: value` string (the admin UI textarea
// format) into a plain headers object suitable for `fetch`. Lenient on
// whitespace and skips blank lines + `#`-prefixed comments. Header names
// are lowercased so duplicates from the input collapse predictably.
//
// Examples of valid input:
//
//   X-Scrape-Token: abc123
//   Authorization: Bearer xyz
//   # the line below is ignored
//   User-Agent: my-scraper/1.0

export function parseCustomHeaders(raw: string | undefined | null): Record<string, string> {
	if (!raw) return {}
	const out: Record<string, string> = {}
	for (const rawLine of raw.split(/\r?\n/)) {
		const line = rawLine.trim()
		if (!line) continue
		if (line.startsWith('#')) continue
		const colon = line.indexOf(':')
		if (colon === -1) continue
		const name = line.slice(0, colon).trim()
		const value = line.slice(colon + 1).trim()
		if (!name || !value) continue
		out[name.toLowerCase()] = value
	}
	return out
}
