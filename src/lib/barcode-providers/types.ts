// Common shape every barcode provider boils down to. iOS (and any
// future client) reads this shape directly - it has no per-provider
// branches. The provider id is preserved on the response envelope so
// admins can diagnose which provider answered a given lookup.
//
// Most providers can return 0:N candidates for a single barcode
// (UPCitemdb's `items[]`, Go-UPC's single-product response, an Amazon
// search-page fallback's multiple SKUs). `BarcodeProvider.lookup`
// returns:
//   - `null` for a clean miss (404 → fall through to fallback or
//     respond not-found).
//   - A non-empty `ProviderResult[]` for any hit. Order is provider-
//     preferred (best first).
// A `throw` means provider-unavailable (network, 5xx, missing key) and
// short-circuits to a 503 if there's no fallback.

export interface ProviderResult {
	title?: string
	brand?: string
	imageUrl?: string
	// A best-guess outbound URL the client can hand to the URL-scrape
	// pipeline for richer metadata. Optional: not every provider has one.
	candidateUrl?: string
}

export type BarcodeProviderId = 'upcitemdb-trial' | 'go-upc'

export interface BarcodeProvider {
	readonly id: BarcodeProviderId
	readonly displayName: string
	/** False when required configuration (e.g. an API key) is missing. */
	readonly isAvailable: () => boolean
	lookup: (gtin14: string, signal: AbortSignal) => Promise<Array<ProviderResult> | null>
}
