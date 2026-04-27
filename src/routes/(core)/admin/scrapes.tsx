import { createFileRoute } from '@tanstack/react-router'

import { ScrapesList } from '@/components/admin/scrapes-list'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'

export const Route = createFileRoute('/(core)/admin/scrapes')({
	component: AdminScrapesPage,
})

function AdminScrapesPage() {
	return (
		<Card className="animate-page-in">
			<CardHeader>
				<CardTitle className="text-2xl">Scrapes</CardTitle>
				<CardDescription>
					Recent scrape attempts (newest first, capped at 200). Click the inspect icon on any row to see the full response data, the
					per-column extracted fields, and which user triggered the scrape.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ClientOnly>
					<ScrapesList />
				</ClientOnly>
			</CardContent>
		</Card>
	)
}
