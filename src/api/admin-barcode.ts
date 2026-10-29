// Admin-only server fns for the /admin/barcode page.
//
// `runBarcodeProbeAsAdmin` exposes the per-provider tester: pick a
// provider id and a barcode, the server runs that provider in
// isolation (no cache read, no cache write) and returns the raw
// normalized result. Lets an operator confirm a configured provider
// actually works without polluting the cache.
//
// `listBarcodeLookupsAsAdmin` backs the Lookup History card: the most
// recent rows from `barcode_lookup_history`, joined to the user who
// scanned.

import { createServerFn } from '@tanstack/react-start'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { type BarcodeProviderProbeResult, runBarcodeProviderProbeImpl } from '@/api/_products-impl'
import { db } from '@/db'
import { type BarcodeCacheCandidate, barcodeLookupHistory, users } from '@/db/schema'
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

const LIST_LIMIT = 200

export type BarcodeLookupListRow = {
	id: number
	rawCode: string
	gtin14: string | null
	// 'ok' | 'not-found' | 'provider-unavailable' | 'invalid-code'
	outcome: string
	source: string | null
	providerId: string | null
	results: Array<BarcodeCacheCandidate> | null
	errorMessage: string | null
	ms: number | null
	createdAt: Date
	userId: string | null
	userName: string | null
	userEmail: string | null
}

// Newest first, capped. Rows carry their candidates (a few short
// objects each), so the detail dialog needs no second fetch.
export const listBarcodeLookupsAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.handler(async (): Promise<Array<BarcodeLookupListRow>> => {
		return db
			.select({
				id: barcodeLookupHistory.id,
				rawCode: barcodeLookupHistory.rawCode,
				gtin14: barcodeLookupHistory.gtin14,
				outcome: barcodeLookupHistory.outcome,
				source: barcodeLookupHistory.source,
				providerId: barcodeLookupHistory.providerId,
				results: barcodeLookupHistory.results,
				errorMessage: barcodeLookupHistory.errorMessage,
				ms: barcodeLookupHistory.ms,
				createdAt: barcodeLookupHistory.createdAt,
				userId: barcodeLookupHistory.userId,
				userName: users.name,
				userEmail: users.email,
			})
			.from(barcodeLookupHistory)
			.leftJoin(users, eq(users.id, barcodeLookupHistory.userId))
			.orderBy(desc(barcodeLookupHistory.createdAt))
			.limit(LIST_LIMIT)
	})
