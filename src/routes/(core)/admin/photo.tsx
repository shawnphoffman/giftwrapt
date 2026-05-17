import { createFileRoute } from '@tanstack/react-router'

import { PhotoExtractTester } from '@/components/admin/photo-extract-tester'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'

// Intentionally NOT linked from the admin sidebar (`src/components/admin/links.tsx`).
// Reach via the direct URL `/admin/photo` while the feature stabilizes;
// same convention as the `/admin/barcode` and `/temp` pages.
export const Route = createFileRoute('/(core)/admin/photo')({
	component: AdminPhotoPage,
})

function AdminPhotoPage() {
	return (
		<Card className="animate-page-in max-w-2xl">
			<CardHeader>
				<CardTitle className="text-2xl">Photo Extraction</CardTitle>
				<CardDescription>
					AI vision extractor behind <code>POST /api/scrape/photo</code> (web) and <code>POST /api/mobile/v1/scrape/photo</code> (iOS). The
					add-item Upload Photo flow uses the same endpoint to prefill a draft; this page lets admins verify the configured AI model can
					actually return a ScrapeResult from a photo before the feature is exposed to users.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ClientOnly>
					<PhotoExtractTester />
				</ClientOnly>
			</CardContent>
		</Card>
	)
}
