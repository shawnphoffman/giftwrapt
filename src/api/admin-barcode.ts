// Admin-only server fns for the /admin/barcode page.
//
// `runBarcodeProbeAsAdmin` exposes the per-provider tester: pick a
// provider id and a barcode, the server runs that provider in
// isolation (no cache read, no cache write) and returns the raw
// normalized result. Lets an operator confirm a configured provider
// actually works without polluting the cache.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { type BarcodeProviderProbeResult, runBarcodeProviderProbeImpl } from '@/api/_products-impl'
import { loadAllBarcodeProvidersForAdmin } from '@/lib/barcode-providers/load-configured'
import { loggingMiddleware } from '@/lib/logger'
import { adminAuthMiddleware } from '@/middleware/auth'

const ProbeInputSchema = z.object({
	providerId: z.enum(['upcitemdb-trial', 'go-upc']),
	code: z.string().min(1).max(32),
})

export const runBarcodeProbeAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: unknown) => ProbeInputSchema.parse(data))
	.handler(async ({ data }): Promise<BarcodeProviderProbeResult> => {
		const providers = await loadAllBarcodeProvidersForAdmin()
		return runBarcodeProviderProbeImpl({
			providerId: data.providerId,
			rawCode: data.code,
			allProviders: providers,
		})
	})
