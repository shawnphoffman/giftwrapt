import { db } from '@/db'
import { AiBudgetExceededError, type AiCallSource } from '@/lib/ai-call'
import { composeSuggestedNotes, identifyProduct, loadIdentifyModel, type ProductIdentity } from '@/lib/product-identify'
import { getAppSettings } from '@/lib/settings-loader'

import { coerceScrapeResult, ScrapeProviderError, type ScrapeResult } from './types'

// One-shot vision extractor. Given an image (the user's product photo,
// in practice usually a hang tag or box label), returns the same
// ScrapeResult shape the URL scraper produces so the add-item form can
// reuse `applyScrapePrefill` unchanged, plus the typed identity and the
// notes lines the server wrote from it.
//
// Unlike the URL pipeline (multiple tiered providers, orchestrator,
// cache, SSE stream), this is a single LLM round-trip: there's no
// "fall back to fetch" alternative when the input is a raw photo. The
// configured AI model must be vision-capable; the model errors with a
// clear `invalid_response` if it isn't, surfaced to the caller as-is.
//
// The prompt, the field cleaning, and the notes wording live in
// `@/lib/product-identify`, shared with the barcode lookup.

export type ExtractFromPhotoArgs = {
	bytes: Uint8Array
	mediaType: string
	signal?: AbortSignal
	// Who uploaded the photo, for the usage ledger.
	userId?: string | null
	// Which surface asked, for the usage ledger. Defaults to the web app.
	source?: AiCallSource
	// A barcode the client read from the same item (a scan that found
	// nothing). Context for the model only.
	scannedCode?: string
}

export type ExtractFromPhotoResult = {
	result: ScrapeResult
	// What the photo shows, field by field. Empty when nothing was readable.
	identity: ProductIdentity
	// Notes lines for the item ("Size: XS", "Style: ..."), or '' when the
	// photo gave none. A default the user can edit.
	suggestedNotes: string
	ms: number
}

export async function extractFromPhoto({
	bytes,
	mediaType,
	signal,
	userId,
	source = 'web',
	scannedCode,
}: ExtractFromPhotoArgs): Promise<ExtractFromPhotoResult> {
	const settings = await getAppSettings(db)
	if (!settings.aiPhotoExtractEnabled) {
		throw new ScrapeProviderError('config_missing', 'Photo to item is turned off on this deployment')
	}
	const ai = await loadIdentifyModel(db)
	if (!ai) {
		throw new ScrapeProviderError('config_missing', 'AI provider not configured')
	}

	const start = Date.now()
	let identity: ProductIdentity
	try {
		identity = await identifyProduct({ feature: 'photo-extract', userId, source }, ai, { photo: { bytes, mediaType }, scannedCode }, signal)
	} catch (err) {
		if (err instanceof AiBudgetExceededError) throw err
		if (err instanceof Error && (err.name === 'AbortError' || /aborted|timeout/i.test(err.message))) {
			throw new ScrapeProviderError('timeout', err.message)
		}
		throw new ScrapeProviderError('invalid_response', err instanceof Error ? err.message : String(err))
	}

	const suggestedNotes = composeSuggestedNotes(identity)
	// A photo has no source page: no image URLs, site name, or final URL.
	const result: ScrapeResult = coerceScrapeResult({
		title: identity.title,
		description: suggestedNotes || undefined,
		price: identity.price,
		currency: identity.currency,
		imageUrls: [],
	})

	return { result, identity, suggestedNotes, ms: Date.now() - start }
}
