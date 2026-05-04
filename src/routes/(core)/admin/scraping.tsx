import { createFileRoute } from '@tanstack/react-router'
import { ScanSearch } from 'lucide-react'
import { useState } from 'react'

import { ImportSettingsForm } from '@/components/admin/import-settings-form'
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
			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Scraper Settings</CardTitle>
					<CardDescription>
						Timing budgets and the URL-cache TTL that govern every scrape attempt. AI-specific toggles live under <em>AI</em>.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<ScraperTimingForm />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Bulk Import & Scrape Queue</CardTitle>
					<CardDescription>
						Foundation flags for the bulk-import flow on the list-edit page. The scrape queue is a background cron-tick runner that fills in
						URL metadata after items are created.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<ImportSettingsForm />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Scrapers</CardTitle>
					<CardDescription>
						Configure the providers in the URL-import pipeline. The built-in fetch provider is always on; everything else is configured
						below.
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
					<CardTitle className="text-2xl">Scrape History</CardTitle>
					<CardDescription>
						Recent scrape attempts (newest first, capped at 200). Inspect any row to see the full response data, the per-column extracted
						fields, and which user triggered the scrape.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button type="button" variant="outline" onClick={() => setScrapesOpen(true)}>
						<ScanSearch />
						View recent scrapes
					</Button>
				</CardContent>
			</Card>
			<Dialog open={scrapesOpen} onOpenChange={setScrapesOpen}>
				<DialogContent className="sm:max-w-[95vw] max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Recent scrapes</DialogTitle>
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
