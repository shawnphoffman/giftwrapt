import { createFileRoute } from '@tanstack/react-router'
import { ScanSearch } from 'lucide-react'
import { useState } from 'react'

import { ImportSettingsForm } from '@/components/admin/import-settings-form'
import { ScrapeStats } from '@/components/admin/scrape-stats'
import { ScrapeProvidersList, ScraperTimingForm } from '@/components/admin/scraper-providers-form'
import { ScrapesList } from '@/components/admin/scrapes-list'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ClientOnly } from '@/components/utilities/client-only'

export const Route = createFileRoute('/(core)/admin/scraping')({
	component: AdminScrapingPage,
})

function AdminScrapingPage() {
	const [scrapesOpen, setScrapesOpen] = useState(false)

	return (
		<>
			<Card className="animate-page-in max-w-2xl">
				<CardHeader>
					<CardTitle className="text-2xl">Scraper Settings</CardTitle>
					<CardDescription>
						Time limits for every scrape, and how long results stay cached by URL. AI-specific settings are under <em>AI</em>.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<ScraperTimingForm />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-2xl">
				<CardHeader>
					<CardTitle className="text-2xl">Bulk Import & Scrape Queue</CardTitle>
					<CardDescription>
						Settings for bulk import on the list edit page. The scrape queue is a background cron job that fills in details from each item's
						URL after the items are created.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<ImportSettingsForm />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-2xl">
				<CardHeader>
					<CardTitle className="text-2xl">Scrapers</CardTitle>
					<CardDescription>
						Set up the providers used to import items from URLs. The built-in fetch provider is always on. Configure any others below.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<ScrapeProvidersList />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Scrape Health</CardTitle>
					<CardDescription>
						Success rates for each provider, plus the domains and error codes that fail most often in the selected time range. Successes are
						counted on the server. Failures are loaded individually (up to 5,000) so they can be grouped by domain from their actual URLs.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<ScrapeStats />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-2xl">
				<CardHeader>
					<CardTitle className="text-2xl">Scrape History</CardTitle>
					<CardDescription>
						Recent scrape attempts (newest first, capped at 200). Inspect any row to see the full response data, the per-column extracted
						fields, and which user triggered the scrape.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button type="button" variant="outline" onClick={() => setScrapesOpen(true)}>
						<ScanSearch />
						View Recent Scrapes
					</Button>
				</CardContent>
			</Card>
			<Dialog open={scrapesOpen} onOpenChange={setScrapesOpen}>
				<DialogContent className="sm:max-w-[95vw] max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Recent Scrapes</DialogTitle>
						<DialogDescription>
							Recent scrape attempts (newest first, capped at 200). Click the inspect icon on any row to see the full response data, the
							per-column extracted fields, and which user triggered the scrape.
						</DialogDescription>
					</DialogHeader>
					<ClientOnly>
						<ScrapesList />
					</ClientOnly>
				</DialogContent>
			</Dialog>
		</>
	)
}
