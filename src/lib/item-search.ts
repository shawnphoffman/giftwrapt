// Shared contract for the "search my items" surface. Client-safe on purpose:
// the dialog and `searchMyItemsImpl` both import from here so the minimum query
// length and the result cap can't drift between the gate the UI enforces and
// the one the server enforces.
//
// Matching itself is server-side (SQL `ILIKE` + a ranking `CASE`). The dialog
// used to fetch every item the viewer owned and let cmdk score the whole set on
// every keystroke, which is what made typing lag by seconds.

// Below this many characters we don't search at all. A 1-2 character query
// matches most of the set, so it's all cost and no signal for a query nobody
// has finished typing.
export const MIN_ITEM_SEARCH_QUERY_LENGTH = 3

// Hard cap on rows returned (and therefore mounted). cmdk keeps every rendered
// row in the DOM and re-touches it on each keystroke, so an uncapped result set
// tanks the dialog no matter how fast the query is. The response carries the
// true match count separately so the UI can say what it's leaving out.
export const MAX_ITEM_SEARCH_RESULTS = 50

/**
 * Split a raw query into the tokens that must each match somewhere in an
 * item's title, list name, or notes.
 *
 * Returns `[]` for a query below {@link MIN_ITEM_SEARCH_QUERY_LENGTH}, which is
 * the signal for "don't search."
 */
export function tokenizeItemSearchQuery(query: string): Array<string> {
	const trimmed = query.trim()
	if (trimmed.length < MIN_ITEM_SEARCH_QUERY_LENGTH) return []
	return trimmed.split(/\s+/)
}

/**
 * Escape the `LIKE` / `ILIKE` metacharacters in a user-supplied string so a
 * query containing `%` or `_` matches those characters literally.
 *
 * Assumes the default backslash escape character. The result is still bound as
 * a query parameter; this is about pattern semantics, not injection.
 */
export function escapeLikePattern(value: string): string {
	return value.replace(/[\\%_]/g, char => `\\${char}`)
}
