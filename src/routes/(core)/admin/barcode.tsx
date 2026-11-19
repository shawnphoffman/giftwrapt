import { createFileRoute, redirect } from '@tanstack/react-router'
import { ScanBarcode } from 'lucide-react'
import { useState } from 'react'

import { fetchAppSettings } from '@/api/settings'
import { BarcodeLookupsList } from '@/components/admin/barcode-lookups-list'
import { BarcodeSettingsEditor } from '@/components/admin/barcode-settings-editor'
import { RichMessage } from '@/components/common/rich-message'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ClientOnly } from '@/components/utilities/client-only'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

// Gated by `appSettings.enableMobileApp` — the iOS app is the only
// consumer of the lookup endpoint (the mobile-API surface itself
// returns 503 mobile-app-disabled when the flag is off; see
// `src/server/mobile-api/app.ts`), so the admin page is hidden on
// web-only deployments. The matching sidebar entry in
// `src/components/admin/links.tsx` reads the same flag; this redirect
// is the defense-in-depth backstop for direct-URL access.
export const Route = createFileRoute('/(core)/admin/barcode')({
	head: pageHead(() => m.page_barcode_lookup()),
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
					<CardTitle className="text-2xl">{m.admin_nav_barcode_title()}</CardTitle>
					<CardDescription>
						<RichMessage parts={m.admin_nav_barcode_description.parts()} tags={{ code: c => <code>{c}</code> }} />
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
					<CardTitle className="text-2xl">{m.admin_nav_barcode_history_title()}</CardTitle>
					<CardDescription>{m.admin_nav_barcode_history_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<Button type="button" variant="outline" onClick={() => setLookupsOpen(true)}>
						<ScanBarcode />
						{m.admin_nav_barcode_view_recent()}
					</Button>
				</CardContent>
			</Card>
			<Dialog open={lookupsOpen} onOpenChange={setLookupsOpen}>
				<DialogContent className="sm:max-w-[95vw] max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>{m.admin_nav_barcode_dialog_title()}</DialogTitle>
						<DialogDescription>{m.admin_nav_barcode_dialog_description()}</DialogDescription>
					</DialogHeader>
					<ClientOnly>
						<BarcodeLookupsList />
					</ClientOnly>
				</DialogContent>
			</Dialog>
		</>
	)
}
