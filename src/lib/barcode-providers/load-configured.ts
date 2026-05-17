// Server-only. Builds the barcode provider registry from the current
// `app_settings.barcode` block.
//
// The endpoint uses a single PRIMARY provider (admin-selected via
// `settings.barcode.providerId`). The admin tester surfaces ALL
// constructible providers so an operator can probe each one
// independently.
//
// Deliberately independent from the URL-scrape pipeline: nothing here
// references the scrape orchestrator, scrape cache, or items.

import { db } from '@/db'
import { getAppSettings } from '@/lib/settings-loader'

import { createGoUpcProvider } from './go-upc'
import type { BarcodeProvider, BarcodeProviderId } from './types'
import { createUpcItemDbTrialProvider } from './upcitemdb-trial'

export async function loadConfiguredBarcodeProvider(): Promise<BarcodeProvider | null> {
	const settings = await getAppSettings(db)
	const cfg = settings.barcode
	if (cfg.providerId === 'upcitemdb-trial') {
		return createUpcItemDbTrialProvider()
	}
	const p = createGoUpcProvider(cfg.goUpcKey)
	return p.isAvailable() ? p : null
}

// Build EVERY provider the admin might want to test in isolation,
// regardless of which one is currently active. Returned even when
// `isAvailable()` is false so the tester UI can render a clear
// "missing key" state per provider.
export async function loadAllBarcodeProvidersForAdmin(): Promise<Array<BarcodeProvider>> {
	const settings = await getAppSettings(db)
	const cfg = settings.barcode
	return [createUpcItemDbTrialProvider(), createGoUpcProvider(cfg.goUpcKey)]
}

export function isKnownBarcodeProviderId(id: string): id is BarcodeProviderId {
	return id === 'upcitemdb-trial' || id === 'go-upc'
}
