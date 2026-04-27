import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

// Presentational AI scraping section. Pure props in, callback out so it can
// render in Storybook without dragging in server-fn imports. The data-aware
// `<AiScrapingSection>` (next to this file) wires it to the live settings
// hooks and the appSettings mutation.
//
// Only `scrapeAiCleanTitlesEnabled` lives here now. The legacy
// `scrapeAiProviderEnabled` toggle was replaced by an `ai`-typed entry in
// `scrapeProviders` (manage it under /admin/scraping). The bootstrap step
// migrated any pre-tier toggle value into a default `ai` entry on first
// boot; the schema field is now read-only and unused by the orchestrator.

export type AiScrapingSectionViewProps = {
	scrapeAiCleanTitlesEnabled: boolean
	aiAvailable: boolean
	disabled?: boolean
	onChange: (key: 'scrapeAiCleanTitlesEnabled', value: boolean) => void
}

export function AiScrapingSectionView({ scrapeAiCleanTitlesEnabled, aiAvailable, disabled, onChange }: AiScrapingSectionViewProps) {
	const inputsDisabled = !aiAvailable || disabled === true

	return (
		<div className="space-y-6">
			<div className="space-y-1">
				<h3 className="text-base font-medium">Scraping</h3>
				<p className="text-sm text-muted-foreground">
					Optional AI title-cleanup post-pass. Runs after the winning provider returns; uses the AI provider configured above. The AI
					scraper itself is now configured under{' '}
					<a className="underline" href="/admin/scraping">
						/admin/scraping
					</a>{' '}
					as a typed entry alongside the rest of the providers.
				</p>
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

			{!aiAvailable && <p className="text-sm text-muted-foreground">Configure an AI provider above to enable this.</p>}
		</div>
	)
}
