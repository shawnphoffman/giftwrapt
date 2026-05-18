import { createFileRoute, redirect } from '@tanstack/react-router'

import { fetchAppSettings } from '@/api/settings'
import { BarcodeSettingsEditor } from '@/components/admin/barcode-settings-editor'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'

// Gated by `appSettings.enableMobileApp` — the iOS app is the only
// consumer of the lookup endpoint (the mobile-API surface itself
// returns 503 mobile-app-disabled when the flag is off; see
// `src/server/mobile-api/app.ts`), so the admin page is hidden on
// web-only deployments. The matching sidebar entry in
// `src/components/admin/links.tsx` reads the same flag; this redirect
// is the defense-in-depth backstop for direct-URL access.
export const Route = createFileRoute('/(core)/admin/barcode')({
	beforeLoad: async () => {
		const settings = await fetchAppSettings()
		if (!settings.enableMobileApp) {
			throw redirect({ to: '/admin' })
		}
	},
	component: AdminBarcodePage,
})

function AdminBarcodePage() {
	return (
		<Card className="animate-page-in max-w-2xl">
			<CardHeader>
				<CardTitle className="text-2xl">Barcode Lookup</CardTitle>
				<CardDescription>
					Pluggable provider layer behind <code>POST /api/mobile/v1/products/by-barcode</code>. iOS uses the result to prepopulate an
					add-item sheet; the endpoint never writes items itself.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ClientOnly>
					<BarcodeSettingsEditor />
				</ClientOnly>
			</CardContent>
		</Card>
	)
}
