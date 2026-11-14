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
	// Up to a few store names that list the product, when the provider
	// reports them. Shown to gift buyers as "Sold at".
	soldAt?: Array<string>
}

export type BarcodeProviderId = 'upcitemdb-trial' | 'go-upc'

// Each provider's own web hosts. A `candidateUrl` on one of them is the
// provider's catalog page or tracking redirect, not a store page: it is
// no use to a gift buyer and the URL scraper cannot read it, so the
// lookup drops it (see `sanitizeCandidates` in `_products-impl.ts`).
export const BARCODE_PROVIDER_OWN_HOSTS: Readonly<Record<string, ReadonlyArray<string>>> = {
	'upcitemdb-trial': ['upcitemdb.com'],
	'go-upc': ['go-upc.com'],
}

export interface BarcodeProvider {
	readonly id: BarcodeProviderId
	readonly displayName: string
	/** False when required configuration (e.g. an API key) is missing. */
	readonly isAvailable: () => boolean
	lookup: (gtin14: string, signal: AbortSignal) => Promise<Array<ProviderResult> | null>
}
