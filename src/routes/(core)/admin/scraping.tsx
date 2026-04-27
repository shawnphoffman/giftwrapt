import { createFileRoute } from '@tanstack/react-router'

import { ScraperProvidersForm } from '@/components/admin/scraper-providers-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'

export const Route = createFileRoute('/(core)/admin/scraping')({
	component: AdminScrapingPage,
})

function AdminScrapingPage() {
	return (
		<Card className="animate-page-in">
			<CardHeader>
				<CardTitle className="text-2xl">Scraping</CardTitle>
				<CardDescription>
					Tune the URL-import pipeline. The built-in fetch provider is always on; everything else is configured below. AI-specific toggles
					live under <em>AI</em>.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ClientOnly>
					<ScraperProvidersForm />
				</ClientOnly>
			</CardContent>
		</Card>
	)
}
