import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

// Presentational AI scraping section. Pure props in, callback out so it can
// render in Storybook without dragging in server-fn imports. The data-aware
// `<AiScrapingSection>` (next to this file) wires it to the live settings
// hooks and the appSettings mutation.

export type AiScrapingSectionViewProps = {
	scrapeAiProviderEnabled: boolean
	scrapeAiCleanTitlesEnabled: boolean
	aiAvailable: boolean
	disabled?: boolean
	onChange: (key: 'scrapeAiProviderEnabled' | 'scrapeAiCleanTitlesEnabled', value: boolean) => void
}

export function AiScrapingSectionView({
	scrapeAiProviderEnabled,
	scrapeAiCleanTitlesEnabled,
	aiAvailable,
	disabled,
	onChange,
}: AiScrapingSectionViewProps) {
	const inputsDisabled = !aiAvailable || disabled === true

	return (
		<div className="space-y-6">
			<div className="space-y-1">
				<h3 className="text-base font-medium">Scraping</h3>
				<p className="text-sm text-muted-foreground">
					Optional AI features that enrich URL imports. Both run only when an AI provider is configured above.
				</p>
			</div>

			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="scrapeAiProviderEnabled" className="text-base">
						Attempt to scrape URL with AI provider
					</Label>
					<p className="text-sm text-muted-foreground">
						Adds an AI scraper that races alongside the standard provider chain. Highest-scoring result wins.
					</p>
				</div>
				<Switch
					id="scrapeAiProviderEnabled"
					checked={scrapeAiProviderEnabled}
					disabled={inputsDisabled}
					onCheckedChange={(checked: boolean) => onChange('scrapeAiProviderEnabled', checked)}
				/>
			</div>

			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="scrapeAiCleanTitlesEnabled" className="text-base">
						Clean imported titles
					</Label>
					<p className="text-sm text-muted-foreground">
						Runs a small AI pass on the winning result to strip retailer noise from the title.
					</p>
				</div>
				<Switch
					id="scrapeAiCleanTitlesEnabled"
					checked={scrapeAiCleanTitlesEnabled}
					disabled={inputsDisabled}
					onCheckedChange={(checked: boolean) => onChange('scrapeAiCleanTitlesEnabled', checked)}
				/>
			</div>

			{!aiAvailable && <p className="text-sm text-muted-foreground">Configure an AI provider above to enable these.</p>}
		</div>
	)
}
