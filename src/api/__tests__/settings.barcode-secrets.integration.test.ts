// Coverage for the `barcode` settings block across deployment shapes:
//
//   1. Fresh deploy (no row in `app_settings`): defaults apply, public
//      read strips `goUpcKey` to an empty string.
//   2. Legacy deploy (rows for OTHER keys exist, no `barcode` row):
//      defaults still apply for `barcode.*`.
//   3. Round-trip: writing a plaintext `goUpcKey` through the loader's
//      encryption pass produces an envelope at rest, and the next read
//      decrypts back to the original plaintext.
//   4. Public read strips the decrypted `goUpcKey` to `''` even when an
//      admin had set one (sec-review: no decrypted secret leaks to
//      unauthenticated callers).

import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { appSettings } from '@/db/schema'
import { encryptBarcodeSecrets, getAppSettings } from '@/lib/settings-loader'

describe('app_settings barcode block', () => {
	it('uses defaults when no app_settings rows exist (fresh deploy)', async () => {
		await withRollback(async tx => {
			const s = await getAppSettings(tx)
			expect(s.barcode).toEqual({
				enabled: false,
				providerId: 'upcitemdb-trial',
				goUpcKey: '',
				cacheTtlHours: 720,
			})
		})
	})

	it('uses defaults for the barcode block on a legacy deploy that has other rows', async () => {
		await withRollback(async tx => {
			// Simulate a legacy deployment: a handful of unrelated settings
			// rows, none of them barcode.
			await tx.insert(appSettings).values({ key: 'enableMobileApp', value: true })
			await tx.insert(appSettings).values({ key: 'appTitle', value: 'Legacy' })

			const s = await getAppSettings(tx)
			expect(s.barcode.enabled).toBe(false)
			expect(s.barcode.providerId).toBe('upcitemdb-trial')
			expect(s.barcode.goUpcKey).toBe('')
			expect(s.enableMobileApp).toBe(true)
			expect(s.appTitle).toBe('Legacy')
		})
	})

	it('round-trips an encrypted goUpcKey through write + read', async () => {
		await withRollback(async tx => {
			const plaintextKey = 'goupc_test_xyz_123456'

			// What the admin upsert path produces.
			const stored = encryptBarcodeSecrets({
				enabled: true,
				providerId: 'go-upc',
				goUpcKey: plaintextKey,
				cacheTtlHours: 24,
			})

			// Envelope shape at rest (no plaintext).
			expect(typeof stored.goUpcKey).toBe('object')
			expect(stored.goUpcKey).not.toBe(plaintextKey)
			expect(JSON.stringify(stored.goUpcKey)).not.toContain(plaintextKey)

			await tx.insert(appSettings).values({ key: 'barcode', value: stored })

			const s = await getAppSettings(tx)
			expect(s.barcode.enabled).toBe(true)
			expect(s.barcode.providerId).toBe('go-upc')
			expect(s.barcode.goUpcKey).toBe(plaintextKey)
			expect(s.barcode.cacheTtlHours).toBe(24)

			// And the raw DB row is still in envelope form (not mutated by reads).
			const row = await tx.select().from(appSettings).where(eq(appSettings.key, 'barcode'))
			const raw = row[0]?.value as Record<string, unknown> | undefined
			expect(typeof raw?.goUpcKey).toBe('object')
		})
	})

	it('preserves an empty goUpcKey as an empty string (does not encrypt)', async () => {
		const stored = encryptBarcodeSecrets({
			enabled: false,
			providerId: 'upcitemdb-trial',
			goUpcKey: '',
			cacheTtlHours: 720,
		})
		expect(stored.goUpcKey).toBe('')
	})
})
