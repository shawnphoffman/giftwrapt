import { createFileRoute } from '@tanstack/react-router'

import { PhotoExtractTester } from '@/components/admin/photo-extract-tester'
import { RichMessage } from '@/components/common/rich-message'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

// Intentionally NOT linked from the admin sidebar (`src/components/admin/links.tsx`).
// Reach via the direct URL `/admin/photo` while the feature stabilizes;
// same convention as the `/admin/barcode` and `/temp` pages.
export const Route = createFileRoute('/(core)/admin/photo')({
	head: pageHead(() => m.page_photo_to_item()),
	component: AdminPhotoPage,
})

function AdminPhotoPage() {
	return (
		<Card className="animate-page-in max-w-2xl">
			<CardHeader>
				<CardTitle className="text-2xl">{m.admin_nav_photo_title()}</CardTitle>
				<CardDescription>
					<RichMessage parts={m.admin_nav_photo_description.parts()} tags={{ code: c => <code>{c}</code> }} />
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
