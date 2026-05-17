// POST /api/mobile/v1/products/by-barcode
//
// Thin shim over `lookupProductByBarcodeImpl`. Owns the wire shape
// (input schema + verbose error envelope mapping). The impl owns all
// state (cache reads/writes, provider dispatch, in-process coalescing).

import type { Hono } from 'hono'
import { z } from 'zod'

import { lookupProductByBarcodeImpl } from '@/api/_products-impl'
import { db } from '@/db'
import { barcodeLookupLimiter } from '@/lib/rate-limits'
import { getAppSettings } from '@/lib/settings-loader'

import type { MobileAuthContext } from '../auth'
import { jsonError } from '../envelope'
import { rateLimit } from '../middleware'

const BarcodeInputSchema = z.object({
	code: z.string().min(1).max(32),
})

export function registerProductRoutes(v1: Hono<MobileAuthContext>): void {
	v1.post('/products/by-barcode', rateLimit(barcodeLookupLimiter), async c => {
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = BarcodeInputSchema.safeParse(body)
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}

		const settings = await getAppSettings(db)
		const result = await lookupProductByBarcodeImpl({
			db,
			rawCode: parsed.data.code,
			settings,
			signal: c.req.raw.signal,
		})

		if (result.kind === 'error') {
			switch (result.reason) {
				case 'barcode-disabled':
				case 'provider-unavailable':
					return jsonError(c, 503, result.reason)
				case 'invalid-code':
					return jsonError(c, 400, 'invalid-barcode')
				case 'not-found':
					return jsonError(c, 404, 'not-found')
			}
		}

		return c.json({
			gtin14: result.gtin14,
			providerId: result.providerId,
			source: result.source,
			cached: result.cached,
			results: result.results,
		})
	})
}
