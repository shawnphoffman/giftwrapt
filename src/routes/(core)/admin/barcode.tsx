import { createFileRoute } from '@tanstack/react-router'

import { BarcodeSettingsEditor } from '@/components/admin/barcode-settings-editor'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'

// Intentionally NOT linked from the admin sidebar (`src/components/admin/links.tsx`).
// Reach via the direct URL `/admin/barcode` while the feature stabilizes;
// same convention as the `/temp` pages.
export const Route = createFileRoute('/(core)/admin/barcode')({
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
