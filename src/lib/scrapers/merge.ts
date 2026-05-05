// Fill-the-gaps merge of multiple per-provider ScrapeResult contributions
// from one tier of the orchestrator. The highest-scoring contribution
// becomes the "base" and any field it leaves empty is filled from
// runners-up in score-descending order (first non-empty wins).
//
// Why fill-the-gaps and not best-of-each-field:
//   - The base's score is already validated; we're only ever ADDING signal
//     that was empty before, never overwriting trusted data.
//   - Avoids Frankenresults (provider A read the wrong product's title,
//     provider B read the right product's price; merging best-of-each
//     yields garbage). With fill-the-gaps, the only way a non-base field
//     wins is if the base didn't have one.
//
// Mirrors the priority pattern the local extractor already uses across
// its OG / JSON-LD / Microdata / Heuristics layers. See
// `lib/scrapers/extractor/index.ts`.

import { filterAndSortImages } from './extractor/images'
import type { MergeContribution, MergedResult, ScrapeResult } from './types'

// Scalar fields that fill-the-gaps from runners-up. `imageUrls` is
// handled separately (concatenate + dedupe). Fields not listed here are
// always inherited from the base.
const SCALAR_FIELDS = ['title', 'description', 'price', 'currency', 'siteName', 'finalUrl'] as const

// Numeric fields that fill-the-gaps from runners-up. Same first-non-empty
// rule as scalars; "empty" here means `undefined` (zero is a valid rating
// or rating count).
const NUMERIC_FIELDS = ['ratingValue', 'ratingCount'] as const

export function mergeWithinTier(contributions: ReadonlyArray<MergeContribution>): MergedResult {
	if (contributions.length === 0) {
		// Caller shouldn't call us here; produce a sane empty result so
		// nothing crashes if they do.
		return { result: { imageUrls: [] }, fromProvider: '' }
	}

	// Sort highest-score first (stable on equal scores: first-passed wins).
	const sorted = [...contributions].sort((a, b) => b.score - a.score)
	const base = sorted[0]

	if (sorted.length === 1) {
		const cloned = cloneResult(base.result)
		cloned.imageUrls = filterAndSortImages(cloned.imageUrls)
		return { result: cloned, fromProvider: base.fromProvider }
	}

	const merged = cloneResult(base.result)
	// Track which contributors filled at least one field so we can render
	// `merged:a,b,c` in score order (the order of `sorted`), not the order
	// in which fields happened to fill.
	const contributingIds = new Set<string>([base.fromProvider])

	for (const field of SCALAR_FIELDS) {
		if (isFilled(merged[field])) continue
		for (let i = 1; i < sorted.length; i++) {
			const candidate = sorted[i].result[field]
			if (isFilled(candidate)) {
				;(merged as Record<string, unknown>)[field] = candidate
				contributingIds.add(sorted[i].fromProvider)
				break
			}
		}
	}

	for (const field of NUMERIC_FIELDS) {
		if (typeof merged[field] === 'number') continue
		for (let i = 1; i < sorted.length; i++) {
			const candidate = sorted[i].result[field]
			if (typeof candidate === 'number') {
				;(merged as Record<string, unknown>)[field] = candidate
				contributingIds.add(sorted[i].fromProvider)
				break
			}
		}
	}

	// imageUrls always merges across all contributors. Append unique URLs
	// from runners-up in score order; the base's order is preserved.
	for (let i = 1; i < sorted.length; i++) {
		const fillerImages = sorted[i].result.imageUrls
		let fillerContributed = false
		for (const url of fillerImages) {
			if (!merged.imageUrls.includes(url)) {
				merged.imageUrls.push(url)
				fillerContributed = true
			}
		}
		if (fillerContributed) {
			contributingIds.add(sorted[i].fromProvider)
		}
	}

	merged.imageUrls = filterAndSortImages(merged.imageUrls)

	const orderedContributors = sorted.map(c => c.fromProvider).filter(id => contributingIds.has(id))

	return {
		result: merged,
		fromProvider: orderedContributors.length === 1 ? orderedContributors[0] : `merged:${orderedContributors.join(',')}`,
	}
}

function cloneResult(result: ScrapeResult): ScrapeResult {
	// Shallow clone with a fresh imageUrls array so the merge mutates a copy.
	return { ...result, imageUrls: [...result.imageUrls] }
}

function isFilled(value: unknown): boolean {
	return typeof value === 'string' && value.trim().length > 0
}
