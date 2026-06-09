import type { ScrapeResult } from './types'

// Pure helper that decides which form fields should pick up values from a
// scrape result. Used by the add/edit item dialogs so they share a single
// rule: "fill any field that is currently empty and that the scrape has a
// value for; preserve everything else as-is." Image candidates always
// flow through so the picker can refresh on a re-scrape, but the
// selected `imageUrl` only changes when the form's current value is empty.
//
// `lastApplied` lets a later scrape event UPGRADE a field that an earlier
// scrape event filled. A single scrape emits the raw result first
// (`result_ready`) and may then emit a refined one (`result_updated`, e.g.
// the AI title-cleanup post-pass replacing the title). Without this, the
// "fill if empty" rule drops the refined value because the field is no
// longer empty. We only upgrade a field whose current value still exactly
// equals what the scrape itself last wrote there - if it differs, the user
// edited it and we preserve their edit.

export type PrefillFields = {
	title: string
	price: string
	notes: string
	imageUrl: string
}

export type PrefillUpdate = {
	title?: string
	price?: string
	notes?: string
	imageUrl?: string
	imageCandidates: ReadonlyArray<string>
}

export function applyScrapePrefill(current: PrefillFields, result: ScrapeResult, lastApplied: Partial<PrefillFields> = {}): PrefillUpdate {
	const update: PrefillUpdate = { imageCandidates: result.imageUrls }
	// A field is writable when it's empty, or when it still holds exactly the
	// value a prior scrape event wrote (untouched by the user).
	const writable = (field: keyof PrefillFields): boolean =>
		!current[field].trim() || (lastApplied[field] !== undefined && current[field] === lastApplied[field])

	if (writable('title') && result.title && result.title !== current.title) update.title = result.title
	if (writable('price') && result.price && result.price !== current.price) update.price = result.price
	if (writable('notes') && result.purchaseVariants?.length) {
		const notes = result.purchaseVariants.map(a => `- ${a}: `).join('\n')
		if (notes !== current.notes) update.notes = notes
	}
	const firstCandidate = result.imageUrls[0]
	if (writable('imageUrl') && firstCandidate && firstCandidate !== current.imageUrl) update.imageUrl = firstCandidate
	return update
}
