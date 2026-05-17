// UPCitemdb trial endpoint. Free tier, no auth, rate-limited at the
// vendor (100/day per IP). Returns a JSON envelope with `items[]`;
// each item carries title, brand, an images[] array, and an offers[]
// array we mine for a candidate URL.

import type { BarcodeProvider, ProviderResult } from './types'

const ENDPOINT = 'https://api.upcitemdb.com/prod/trial/lookup'
const TIMEOUT_MS = 8_000

interface UpcItemDbOffer {
	link?: string
	domain?: string
}

interface UpcItemDbItem {
	title?: string
	brand?: string
	images?: Array<string>
	offers?: Array<UpcItemDbOffer>
}

interface UpcItemDbResponse {
	code?: string
	total?: number
	items?: Array<UpcItemDbItem>
}

function pickCandidateUrl(offers: Array<UpcItemDbOffer> | undefined): string | undefined {
	if (!offers || offers.length === 0) return undefined
	const amazon = offers.find(o => typeof o.link === 'string' && o.link.length > 0 && o.domain === 'amazon.com')
	if (amazon?.link) return amazon.link
	const any = offers.find(o => typeof o.link === 'string' && o.link.length > 0)
	return any?.link
}

function mapItem(item: UpcItemDbItem): ProviderResult {
	const out: ProviderResult = {}
	if (item.title) out.title = item.title
	if (item.brand) out.brand = item.brand
	const image = item.images?.find(s => typeof s === 'string' && s.length > 0)
	if (image) out.imageUrl = image
	const candidateUrl = pickCandidateUrl(item.offers)
	if (candidateUrl) out.candidateUrl = candidateUrl
	return out
}

export function createUpcItemDbTrialProvider(): BarcodeProvider {
	return {
		id: 'upcitemdb-trial',
		displayName: 'UPCitemdb (trial)',
		isAvailable: () => true,
		async lookup(gtin14, signal) {
			const controller = new AbortController()
			const onAbort = () => controller.abort()
			signal.addEventListener('abort', onAbort)
			const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
			let res: Response
			try {
				res = await fetch(`${ENDPOINT}?upc=${encodeURIComponent(gtin14)}`, {
					method: 'GET',
					signal: controller.signal,
					headers: { accept: 'application/json' },
				})
			} catch (err) {
				throw new Error(`upcitemdb network error: ${err instanceof Error ? err.message : String(err)}`)
			} finally {
				clearTimeout(timeout)
				signal.removeEventListener('abort', onAbort)
			}

			// 4xx (other than rate-limit) is treated as a clean miss so
			// the caller can fall through to the configured fallback.
			// 5xx and 429 are provider-unavailable (throw → 503).
			if (res.status === 429 || res.status >= 500) {
				throw new Error(`upcitemdb returned ${res.status}`)
			}
			if (res.status >= 400) return null

			let body: UpcItemDbResponse
			try {
				body = (await res.json()) as UpcItemDbResponse
			} catch {
				throw new Error('upcitemdb returned non-JSON body')
			}
			if (!body.items || body.items.length === 0) return null
			const mapped = body.items.map(mapItem).filter(r => r.title || r.brand || r.imageUrl)
			return mapped.length === 0 ? null : mapped
		},
	}
}
