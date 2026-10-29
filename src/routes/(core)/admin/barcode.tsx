import { createFileRoute, redirect } from '@tanstack/react-router'
import { ScanBarcode } from 'lucide-react'
import { useState } from 'react'

import { fetchAppSettings } from '@/api/settings'
import { BarcodeLookupsList } from '@/components/admin/barcode-lookups-list'
import { BarcodeSettingsEditor } from '@/components/admin/barcode-settings-editor'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ClientOnly } from '@/components/utilities/client-only'
import { pageHead } from '@/routes/-head'

// Gated by `appSettings.enableMobileApp` — the iOS app is the only
// consumer of the lookup endpoint (the mobile-API surface itself
// returns 503 mobile-app-disabled when the flag is off; see
// `src/server/mobile-api/app.ts`), so the admin page is hidden on
// web-only deployments. The matching sidebar entry in
// `src/components/admin/links.tsx` reads the same flag; this redirect
// is the defense-in-depth backstop for direct-URL access.
export const Route = createFileRoute('/(core)/admin/barcode')({
	head: pageHead('Barcode Lookup'),
	beforeLoad: async () => {
		const settings = await fetchAppSettings()
		if (!settings.enableMobileApp) {
			throw redirect({ to: '/admin' })
		}
	},
	component: AdminBarcodePage,
})

function AdminBarcodePage() {
	const [lookupsOpen, setLookupsOpen] = useState(false)

	return (
		<>
			<Card className="animate-page-in max-w-2xl">
				<CardHeader>
					<CardTitle className="text-2xl">Barcode Lookup</CardTitle>
					<CardDescription>
						Choose the providers behind <code>POST /api/mobile/v1/products/by-barcode</code>. The iOS app uses the result to prefill its
						add-item sheet. The endpoint never creates items itself.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<BarcodeSettingsEditor />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-2xl">
				<CardHeader>
					<CardTitle className="text-2xl">Lookup History</CardTitle>
					<CardDescription>
						Recent barcode lookups from the iOS app (newest first, capped at 200), including cache hits, misses, and provider errors.
						Inspect any row to see the candidates the provider returned and who scanned it. Lookups are kept for 90 days by default.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button type="button" variant="outline" onClick={() => setLookupsOpen(true)}>
						<ScanBarcode />
						View Recent Lookups
					</Button>
				</CardContent>
			</Card>
			<Dialog open={lookupsOpen} onOpenChange={setLookupsOpen}>
				<DialogContent className="sm:max-w-[95vw] max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Recent Lookups</DialogTitle>
						<DialogDescription>
							Recent barcode lookups (newest first, capped at 200). Click the inspect icon on any row to see the candidates and raw results.
						</DialogDescription>
					</DialogHeader>
					<ClientOnly>
						<BarcodeLookupsList />
					</ClientOnly>
				</DialogContent>
			</Dialog>
		</>
	)
}
