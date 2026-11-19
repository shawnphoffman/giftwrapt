import { createFileRoute } from '@tanstack/react-router'
import { ScanSearch } from 'lucide-react'
import { useState } from 'react'

import { ImportSettingsForm } from '@/components/admin/import-settings-form'
import { ScrapeStats } from '@/components/admin/scrape-stats'
import { ScrapeProvidersList, ScraperTimingForm } from '@/components/admin/scraper-providers-form'
import { ScrapesList } from '@/components/admin/scrapes-list'
import { RichMessage } from '@/components/common/rich-message'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ClientOnly } from '@/components/utilities/client-only'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

export const Route = createFileRoute('/(core)/admin/scraping')({
	head: pageHead(() => m.page_scraping()),
	component: AdminScrapingPage,
})

function AdminScrapingPage() {
	const [scrapesOpen, setScrapesOpen] = useState(false)

	return (
		<>
			<Card className="animate-page-in max-w-2xl">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_nav_scraping_settings_title()}</CardTitle>
					<CardDescription>
						<RichMessage parts={m.admin_nav_scraping_settings_description.parts()} tags={{ em: c => <em>{c}</em> }} />
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
					<CardTitle className="text-2xl">{m.admin_nav_scraping_bulk_title()}</CardTitle>
					<CardDescription>{m.admin_nav_scraping_bulk_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<ImportSettingsForm />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-2xl">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_nav_scraping_providers_title()}</CardTitle>
					<CardDescription>{m.admin_nav_scraping_providers_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<ScrapeProvidersList />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_nav_scraping_health_title()}</CardTitle>
					<CardDescription>{m.admin_nav_scraping_health_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<ScrapeStats />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-2xl">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_nav_scraping_history_title()}</CardTitle>
					<CardDescription>{m.admin_nav_scraping_history_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<Button type="button" variant="outline" onClick={() => setScrapesOpen(true)}>
						<ScanSearch />
						{m.admin_nav_scraping_view_recent()}
					</Button>
				</CardContent>
			</Card>
			<Dialog open={scrapesOpen} onOpenChange={setScrapesOpen}>
				<DialogContent className="sm:max-w-[95vw] max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>{m.admin_nav_scraping_dialog_title()}</DialogTitle>
						<DialogDescription>{m.admin_nav_scraping_dialog_description()}</DialogDescription>
					</DialogHeader>
					<ClientOnly>
						<ScrapesList />
					</ClientOnly>
				</DialogContent>
			</Dialog>
		</>
	)
}
