// Resolve a possibly-relative URL against the page's final URL. Returns the
// input untouched if the URL constructor rejects it (rare, but possible with
// data:/javascript:/blank values that retailers occasionally serve).
export function resolveUrl(maybeRelative: string, base: string): string {
	try {
		return new URL(maybeRelative, base).toString()
	} catch {
		return maybeRelative
	}
}
