import { jaccard, tokenSet } from '@/lib/text-similarity'

import type { ScrapeResult } from './types'

// Consistency guard for the orchestrator's cross-tier merge. Before a
// provider's result fills gaps in the running merge, it has to describe the
// same product as the merge's base (the highest-scoring result). Without
// this, a later tier that landed on a captcha, a different variant, or a
// redirect to another product would graft its price or photos onto a good
// result.
//
// Rules, in order:
//   1. Both URLs carry an Amazon ASIN and they differ: different product.
//   2. Titles share enough words: same product. Two measures, either one
//      passes:
//        - Jaccard >= 0.5 for titles of similar length
//        - containment >= 0.6 (shared words / words in the shorter title)
//          when the shorter title has at least 3 words, so a terse
//          "Seagate IronWolf Pro 20TB" still matches the full listing
//          title, but a 2-word captcha title ("Amazon.com") does not
//   3. Otherwise: not the same product.
//
// URL equality is deliberately not a pass: every provider fetches the same
// URL, so it would let captcha pages through.

export type SameProductVerdict = { ok: true } | { ok: false; reason: 'different-asin' | 'title-mismatch' }

const JACCARD_MIN = 0.5
const CONTAINMENT_MIN = 0.6
const CONTAINMENT_MIN_WORDS = 3

const ASIN_RE = /\/(?:dp|gp\/product|gp\/aw\/d|product)\/([A-Z0-9]{10})(?=[/?#]|$)/i

export function amazonAsin(url: string | undefined): string | undefined {
	if (!url) return undefined
	return ASIN_RE.exec(url)?.[1]?.toUpperCase()
}

export function isSameProduct(base: ScrapeResult, candidate: ScrapeResult): SameProductVerdict {
	const baseAsin = amazonAsin(base.finalUrl)
	const candidateAsin = amazonAsin(candidate.finalUrl)
	if (baseAsin && candidateAsin && baseAsin !== candidateAsin) return { ok: false, reason: 'different-asin' }

	const a = tokenSet(base.title ?? '')
	const b = tokenSet(candidate.title ?? '')
	if (jaccard(a, b) >= JACCARD_MIN) return { ok: true }

	const [small, large] = a.size <= b.size ? [a, b] : [b, a]
	if (small.size >= CONTAINMENT_MIN_WORDS) {
		let shared = 0
		for (const t of small) if (large.has(t)) shared++
		if (shared / small.size >= CONTAINMENT_MIN) return { ok: true }
	}
	return { ok: false, reason: 'title-mismatch' }
}
