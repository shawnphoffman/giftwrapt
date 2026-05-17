// Go-UPC paid endpoint. Requires a bearer token from
// `settings.barcode.goUpcKey` (stored encrypted at rest). Returns a
// single `product` object per call.

import type { BarcodeProvider, ProviderResult } from './types'

const ENDPOINT = 'https://go-upc.com/api/v1/code'
const TIMEOUT_MS = 8_000

interface GoUpcResponse {
	product?: {
		name?: string
		brand?: string
		imageUrl?: string
		url?: string
	}
}

export function createGoUpcProvider(apiKey: string): BarcodeProvider {
	const key = apiKey.trim()
	return {
		id: 'go-upc',
		displayName: 'Go-UPC',
		isAvailable: () => key.length > 0,
		async lookup(gtin14, signal) {
			if (key.length === 0) throw new Error('go-upc: missing api key')
			const controller = new AbortController()
			const onAbort = () => controller.abort()
			signal.addEventListener('abort', onAbort)
			const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
			let res: Response
			try {
				res = await fetch(`${ENDPOINT}/${encodeURIComponent(gtin14)}`, {
					method: 'GET',
					signal: controller.signal,
					headers: {
						accept: 'application/json',
						authorization: `Bearer ${key}`,
					},
				})
			} catch (err) {
				throw new Error(`go-upc network error: ${err instanceof Error ? err.message : String(err)}`)
			} finally {
				clearTimeout(timeout)
				signal.removeEventListener('abort', onAbort)
			}

			if (res.status === 404) return null
			if (!res.ok) {
				throw new Error(`go-upc returned ${res.status}`)
			}

			let body: GoUpcResponse
			try {
				body = (await res.json()) as GoUpcResponse
			} catch {
				throw new Error('go-upc returned non-JSON body')
			}
			const p = body.product
			if (!p || (!p.name && !p.brand && !p.imageUrl)) return null
			const out: ProviderResult = {}
			if (p.name) out.title = p.name
			if (p.brand) out.brand = p.brand
			if (p.imageUrl) out.imageUrl = p.imageUrl
			if (p.url) out.candidateUrl = p.url
			return [out]
		},
	}
}
