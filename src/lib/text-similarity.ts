// Lightweight text-similarity helpers. Designed for product-title
// comparison in the duplicates analyzer; not a general-purpose NLP
// library. Token-set Jaccard chosen over character n-grams because
// product titles are word-shaped and the thresholds are easier to
// reason about ("share 80% of words" is more intuitive than "share
// 80% of trigrams"). Order-independent: "Apple AirPods Pro" and
// "AirPods Pro Apple" collapse to the same token set.

// Returns the lowercased alpha-numeric token set of a string. Empty
// inputs (after normalization) return an empty set. Single-character
// tokens are kept (they often disambiguate, e.g. "X" in "X-Wing").
export function tokenSet(s: string): Set<string> {
	const out = new Set<string>()
	if (!s) return out
	const cleaned = s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ')
	for (const tok of cleaned.split(/\s+/)) {
		if (tok) out.add(tok)
	}
	return out
}

// Token-set Jaccard similarity in [0, 1]. Two empty sets are defined
// as Jaccard 0 here (not 1) so two title-less items don't get falsely
// paired. The duplicates analyzer never feeds title-less items in
// anyway, but the convention is safer.
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
	if (a.size === 0 || b.size === 0) return 0
	let inter = 0
	// Iterate the smaller set for fewer hashtable lookups.
	const [small, large] = a.size <= b.size ? [a, b] : [b, a]
	for (const t of small) if (large.has(t)) inter++
	const union = a.size + b.size - inter
	return inter / union
}
