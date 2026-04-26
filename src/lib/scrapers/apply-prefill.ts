import type { ScrapeResult } from './types'

// Pure helper that decides which form fields should pick up values from a
// scrape result. Used by the add/edit item dialogs so they share a single
// rule: "fill any field that is currently empty and that the scrape has a
// value for; preserve everything else as-is." Image candidates always
// flow through so the picker can refresh on a re-scrape, but the
// selected `imageUrl` only changes when the form's current value is empty.

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

export function applyScrapePrefill(current: PrefillFields, result: ScrapeResult): PrefillUpdate {
	const update: PrefillUpdate = { imageCandidates: result.imageUrls }
	if (!current.title.trim() && result.title) update.title = result.title
	if (!current.price.trim() && result.price) update.price = result.price
	if (!current.notes.trim() && result.description) update.notes = result.description
	const firstCandidate = result.imageUrls[0]
	if (!current.imageUrl.trim() && firstCandidate) update.imageUrl = firstCandidate
	return update
}
