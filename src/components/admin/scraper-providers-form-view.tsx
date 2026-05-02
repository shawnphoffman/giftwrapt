import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CharacterCounter } from '@/components/ui/character-counter'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type {
	AiEntry,
	AppSettings,
	BrowserbaseFetchEntry,
	BrowserbaseStagehandEntry,
	BrowserlessEntry,
	CustomHttpEntry,
	FlaresolverrEntry,
	GiftWraptScraperEntry,
	ScrapeProviderEntry,
	ScrapeProviderType,
	ScrapflyEntry,
} from '@/lib/settings'
import { LIMITS } from '@/lib/validation/limits'

// Presentational form for scraper-related app settings: timeouts, cache TTL,
// quality threshold, and the discriminated `scrapeProviders` array. Pure
// props in, per-key callback out so it can render in Storybook without
// dragging in server-fn imports. The data-aware wrapper next to this file
// wires it up to the live settings hooks.

export type ScraperProvidersFormViewProps = {
	settings: Pick<
		AppSettings,
		'scrapeProviderTimeoutMs' | 'scrapeOverallTimeoutMs' | 'scrapeQualityThreshold' | 'scrapeCacheTtlHours' | 'scrapeProviders'
	>
	disabled?: boolean
	onChange: <TKey extends ScraperProvidersFormChangeKey>(key: TKey, value: AppSettings[TKey]) => void
}

// Hard upper bound on a per-entry timeout override. Anything higher than
// this almost certainly means the admin typed seconds in a milliseconds
// field by accident; capping at 10 minutes keeps a fat-fingered entry from
// holding the orchestrator open past the overall budget.
const TIMEOUT_OVERRIDE_MAX_MS = 600_000

export type ScraperProvidersFormChangeKey =
	| 'scrapeProviderTimeoutMs'
	| 'scrapeOverallTimeoutMs'
	| 'scrapeQualityThreshold'
	| 'scrapeCacheTtlHours'
	| 'scrapeProviders'

export function ScraperProvidersFormView({ settings, disabled, onChange }: ScraperProvidersFormViewProps) {
	return (
		<div className="@container/scraper-form space-y-8">
			<ScraperTimingFormView settings={settings} disabled={disabled} onChange={onChange} />
			<Separator />
			<ScrapeProvidersListView settings={settings} disabled={disabled} onChange={onChange} />
		</div>
	)
}

export function ScraperTimingFormView({ settings, disabled, onChange }: ScraperProvidersFormViewProps) {
	const inputDisabled = disabled === true

	return (
		<div className="@container/scraper-form space-y-8">
			<NumberRow
				id="scrapeProviderTimeoutMs"
				label="Per-provider timeout"
				suffix="s"
				multiplier={1000}
				hint="Maximum time any one provider has to return before the orchestrator gives up on it and tries the next one."
				value={settings.scrapeProviderTimeoutMs}
				disabled={inputDisabled}
				onCommit={value => onChange('scrapeProviderTimeoutMs', value)}
			/>
			<NumberRow
				id="scrapeOverallTimeoutMs"
				label="Overall scrape budget"
				suffix="s"
				multiplier={1000}
				hint="Hard upper bound on a single scrape including parallel providers. Anything still running at this point is cancelled."
				value={settings.scrapeOverallTimeoutMs}
				disabled={inputDisabled}
				onCommit={value => onChange('scrapeOverallTimeoutMs', value)}
			/>
			<NumberRow
				id="scrapeQualityThreshold"
				label="Quality threshold"
				hint="Score above which the chain stops trying further providers. Lower = more permissive, higher = more thorough but slower."
				value={settings.scrapeQualityThreshold}
				disabled={inputDisabled}
				onCommit={value => onChange('scrapeQualityThreshold', value)}
			/>
			<NumberRow
				id="scrapeCacheTtlHours"
				label="Cache TTL"
				suffix="hours"
				hint="How long a successful scrape stays fresh in the URL-based dedup cache. Set to 0 to disable caching."
				value={settings.scrapeCacheTtlHours}
				disabled={inputDisabled}
				min={0}
				onCommit={value => onChange('scrapeCacheTtlHours', value)}
			/>
		</div>
	)
}

export function ScrapeProvidersListView({ settings, disabled, onChange }: ScraperProvidersFormViewProps) {
	const inputDisabled = disabled === true

	return (
		<div className="@container/scraper-form">
			<ScrapeProvidersSection
				entries={settings.scrapeProviders}
				disabled={inputDisabled}
				onChange={next => onChange('scrapeProviders', next)}
			/>
		</div>
	)
}

// `import.meta.env.DEV` is true in `vite dev` and false in production
// builds. We hide the public GitHub link to the giftwrapt-scraper repo
// behind this in admin help copy until it's ready to surface publicly.
const IS_DEV = import.meta.env.DEV

// ---------------------------------------------------------------------------
// Provider list (0:N entries, mixed types, drag-reorderable)
// ---------------------------------------------------------------------------

const MAX_ENTRIES = 16

const TYPE_LABELS: Record<ScrapeProviderType, string> = {
	browserless: 'Browserless',
	flaresolverr: 'Flaresolverr',
	'browserbase-fetch': 'Browserbase (Fetch)',
	'browserbase-stagehand': 'Browserbase (Stagehand)',
	'custom-http': 'Custom HTTP',
	ai: 'AI extraction',
	'giftwrapt-scraper': 'GiftWrapt Scraper',
	scrapfly: 'ScrapFly',
}

type AddOption = { type: ScrapeProviderType; label: string; hint: string }

const ADD_OPTION_GROUPS: Array<{ label: string; options: Array<AddOption> }> = [
	{
		label: 'Self-hosted',
		options: [
			{ type: 'browserless', label: 'Browserless', hint: 'JS-rendering container' },
			{ type: 'flaresolverr', label: 'Flaresolverr', hint: 'Cloudflare bypass' },
			{ type: 'giftwrapt-scraper', label: 'GiftWrapt Scraper', hint: 'Self-hosted scraping toolchain' },
		],
	},
	{
		label: 'Hosted',
		options: [
			{ type: 'browserbase-fetch', label: 'Browserbase (Fetch API)', hint: 'Rendered HTML, no LLM' },
			{ type: 'browserbase-stagehand', label: 'Browserbase (Stagehand)', hint: 'Structured extraction with LLM' },
			{ type: 'scrapfly', label: 'ScrapFly', hint: 'Scraping API with anti-bot bypass' },
		],
	},
	{
		label: 'Other',
		options: [
			{ type: 'custom-http', label: 'Custom HTTP', hint: 'Bring your own scraper service' },
			{ type: 'ai', label: 'AI extraction', hint: 'LLM extracts from any HTML; uses /admin/ai-settings creds' },
		],
	},
]

function ScrapeProvidersSection({
	entries,
	disabled,
	onChange,
}: {
	entries: ReadonlyArray<ScrapeProviderEntry>
	disabled: boolean
	onChange: (next: Array<ScrapeProviderEntry>) => void
}) {
	// Sort by tier for display; same-tier entries fire in parallel so order
	// among them has no runtime effect. Stable sort preserves the
	// underlying array order for ties, which keeps newly-added entries at
	// the bottom of their tier.
	const sortedEntries = useMemo(() => [...entries].sort((a, b) => a.tier - b.tier), [entries])

	const handleAdd = (type: ScrapeProviderType) => {
		if (entries.length >= MAX_ENTRIES) return
		onChange([...entries, makeDefaultEntry(type, entries.length)])
	}

	const handleReplace = (id: string, next: ScrapeProviderEntry) => {
		onChange(entries.map(e => (e.id === id ? next : e)))
	}

	const handleRemove = (id: string) => {
		onChange(entries.filter(e => e.id !== id))
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-3 @md/scraper-form:flex-row @md/scraper-form:items-end @md/scraper-form:justify-between @md/scraper-form:gap-4">
				<div className="space-y-0.5">
					<Label className="text-base">Scrape providers</Label>
					<p className="text-sm text-muted-foreground">
						Each entry runs only when configured and enabled. Tier 1 entries fire in parallel; the chain advances to tier 2 only if tier
						1&apos;s merged result falls below the quality threshold, and so on. Pick a tier to move an entry between tiers.
					</p>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={disabled || entries.length >= MAX_ENTRIES}
							className="gap-1.5 self-start @md/scraper-form:self-auto"
						>
							<Plus className="size-3.5" />
							Add scraper
							<ChevronDown className="size-3.5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{ADD_OPTION_GROUPS.map((group, groupIndex) => (
							<DropdownMenuGroup key={group.label}>
								{groupIndex > 0 && <DropdownMenuSeparator />}
								<DropdownMenuLabel className="text-xs text-muted-foreground">{group.label}</DropdownMenuLabel>
								{group.options.map(opt => (
									<DropdownMenuItem key={opt.type} onSelect={() => handleAdd(opt.type)}>
										<div className="flex flex-col gap-0.5">
											<span>{opt.label}</span>
											<span className="text-xs text-muted-foreground">{opt.hint}</span>
										</div>
									</DropdownMenuItem>
								))}
							</DropdownMenuGroup>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{sortedEntries.length === 0 ? (
				<p className="text-sm text-muted-foreground italic">No scrapers configured. Click &quot;Add scraper&quot; to wire one up.</p>
			) : (
				<div className="space-y-3">
					{sortedEntries.map((entry, index) => {
						const prevTier = index > 0 ? sortedEntries[index - 1].tier : null
						const showDivider = prevTier !== entry.tier
						return (
							<div key={entry.id}>
								{showDivider && <TierDivider tier={entry.tier} />}
								<EntryCard
									entry={entry}
									disabled={disabled}
									onSave={next => handleReplace(entry.id, next)}
									onRemove={() => handleRemove(entry.id)}
								/>
							</div>
						)
					})}
				</div>
			)}
		</div>
	)
}

function TierDivider({ tier }: { tier: number }) {
	return (
		<div className="flex items-center gap-2 my-4">
			<div className="h-px bg-border flex-1" />
			<Badge variant="outline" className="text-xs">
				Tier {tier}
			</Badge>
			<div className="h-px bg-border flex-1" />
		</div>
	)
}

function makeDefaultEntry(type: ScrapeProviderType, index: number): ScrapeProviderEntry {
	const id = makeEntryId()
	const ordinal = index + 1
	switch (type) {
		case 'browserless':
			return { type, id, name: `Browserless ${ordinal}`, enabled: false, tier: 1, url: '', token: undefined }
		case 'flaresolverr':
			return { type, id, name: `Flaresolverr ${ordinal}`, enabled: false, tier: 1, url: '' }
		case 'browserbase-fetch':
			return {
				type,
				id,
				name: `Browserbase Fetch ${ordinal}`,
				enabled: false,
				tier: 2,
				apiKey: '',
				proxies: true,
				allowRedirects: true,
			}
		case 'browserbase-stagehand':
			return {
				type,
				id,
				name: `Browserbase Stagehand ${ordinal}`,
				enabled: false,
				tier: 3,
				apiKey: '',
				projectId: '',
				modelName: undefined,
				instruction: undefined,
			}
		case 'custom-http':
			return {
				type,
				id,
				name: `Custom HTTP ${ordinal}`,
				enabled: false,
				tier: 1,
				endpoint: '',
				responseKind: 'html',
				customHeaders: undefined,
			}
		case 'ai':
			return { type, id, name: `AI extraction ${ordinal}`, enabled: false, tier: 3 }
		case 'giftwrapt-scraper':
			return { type, id, name: `GiftWrapt Scraper ${ordinal}`, enabled: false, tier: 1, endpoint: '', token: '' }
		case 'scrapfly':
			return { type, id, name: `ScrapFly ${ordinal}`, enabled: false, tier: 2, apiKey: '', asp: true, renderJs: false }
	}
}

// Stable, opaque id for a new entry. Kept short so it doesn't bloat the
// per-row data attributes; uniqueness within ~16 entries is plenty.
function makeEntryId(): string {
	return Math.random().toString(36).slice(2, 10)
}

// ---------------------------------------------------------------------------
// Per-entry card (shell + type-specific body)
// ---------------------------------------------------------------------------

function EntryCard({
	entry,
	disabled,
	onSave,
	onRemove,
}: {
	entry: ScrapeProviderEntry
	disabled: boolean
	onSave: (next: ScrapeProviderEntry) => void
	onRemove: () => void
}) {
	// Each card holds its own draft. Field changes update local state only;
	// nothing reaches `appSettings` until the admin clicks Save. The draft
	// resets when a different entry is mounted in this slot (the parent
	// uses `entry.id` as the React key, so new ids force a remount with a
	// fresh draft seeded from the latest props).
	const [draft, setDraft] = useState<ScrapeProviderEntry>(entry)
	// Cards collapse by default to keep the list scannable; expand when the
	// admin needs to edit. Auto-open whenever the card is dirty so a half-
	// configured entry can't accidentally hide its unsaved state.
	const [open, setOpen] = useState(false)
	const dirty = !isSameEntry(draft, entry)

	const reset = () => setDraft(entry)
	const save = () => {
		const trimmedName = draft.name.trim() || entry.name
		onSave({ ...draft, name: trimmedName } as ScrapeProviderEntry)
	}

	const displayName = draft.name.trim() || TYPE_LABELS[entry.type]
	const expanded = open || dirty

	return (
		<Collapsible open={expanded} onOpenChange={setOpen} className="overflow-hidden rounded-md border bg-muted/40 shadow-sm">
			<div className={`flex items-center gap-2 p-3 ${expanded ? 'bg-muted border-b' : ''}`}>
				<Badge variant="secondary" className="font-mono text-xs shrink-0">
					{TYPE_LABELS[entry.type]}
				</Badge>
				<CollapsibleTrigger asChild>
					<button
						type="button"
						className="flex flex-1 items-center gap-2 min-w-0 text-left rounded-sm hover:bg-muted/40 -mx-1 px-1 py-1"
						aria-label={open || dirty ? `Collapse ${displayName}` : `Expand ${displayName}`}
					>
						{open || dirty ? (
							<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
						) : (
							<ChevronRight className="size-4 shrink-0 text-muted-foreground" />
						)}
						<span className="truncate text-sm font-medium">{displayName}</span>
					</button>
				</CollapsibleTrigger>
				<Switch
					id={`scraper-enabled-${entry.id}`}
					checked={draft.enabled}
					disabled={disabled}
					onCheckedChange={(checked: boolean) => setDraft(prev => ({ ...prev, enabled: checked }))}
					aria-label={draft.enabled ? `Disable ${displayName}` : `Enable ${displayName}`}
				/>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-8 w-8"
					disabled={disabled}
					onClick={onRemove}
					aria-label={`Remove ${displayName}`}
				>
					<Trash2 className="size-4 text-muted-foreground" />
				</Button>
			</div>

			<CollapsibleContent className="space-y-4 px-4 pb-4 pt-3">
				<div className="space-y-1.5 pt-3">
					<div className="flex items-baseline justify-between gap-2">
						<Label htmlFor={`scraper-name-${entry.id}`} className="text-base">
							Name
						</Label>
						<CharacterCounter value={draft.name} max={LIMITS.SHORT_NAME} />
					</div>
					<Input
						id={`scraper-name-${entry.id}`}
						placeholder={TYPE_LABELS[entry.type]}
						value={draft.name}
						disabled={disabled}
						maxLength={LIMITS.SHORT_NAME}
						onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))}
					/>
					<p className="text-xs text-muted-foreground">Shown as the header for this entry. Keep it short.</p>
				</div>

				<div className="space-y-1.5">
					<Label id={`scraper-tier-label-${entry.id}`} className="text-base">
						Tier
					</Label>
					<ToggleGroup
						type="single"
						variant="outline"
						value={String(draft.tier)}
						onValueChange={v => {
							if (v) setDraft(prev => ({ ...prev, tier: Number(v) }) as ScrapeProviderEntry)
						}}
						disabled={disabled}
						aria-labelledby={`scraper-tier-label-${entry.id}`}
						className="grid w-full grid-cols-5"
					>
						{[1, 2, 3, 4, 5].map(n => (
							<ToggleGroupItem
								key={n}
								value={String(n)}
								aria-label={`Tier ${n}`}
								className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground"
							>
								{n}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
					<p className="text-xs text-muted-foreground">
						Lower tiers run first. Tier {draft.tier + 1 <= 5 ? draft.tier + 1 : draft.tier} only fires if tier {draft.tier}
						{draft.tier === 5 ? '' : "'s merged result"} falls below the quality threshold.
					</p>
				</div>

				<TimeoutOverrideRow draft={draft} setDraft={setDraft} disabled={disabled} />

				<EntryFields draft={draft} setDraft={setDraft} disabled={disabled} />

				<div className="flex items-center justify-end gap-2 pt-3 border-t -mx-4 px-4">
					{dirty && <span className="mr-auto text-xs text-muted-foreground italic">Unsaved changes</span>}
					<Button type="button" variant="ghost" size="sm" disabled={disabled || !dirty} onClick={reset}>
						Reset
					</Button>
					<Button type="button" size="sm" disabled={disabled || !dirty} onClick={save}>
						Save
					</Button>
				</div>
			</CollapsibleContent>
		</Collapsible>
	)
}

// ---------------------------------------------------------------------------
// Type-specific field bodies. Each one narrows the discriminated union via
// the entry's `type` field so the draft updates stay type-safe.
// ---------------------------------------------------------------------------

function EntryFields({
	draft,
	setDraft,
	disabled,
}: {
	draft: ScrapeProviderEntry
	setDraft: React.Dispatch<React.SetStateAction<ScrapeProviderEntry>>
	disabled: boolean
}) {
	switch (draft.type) {
		case 'browserless':
			return (
				<BrowserlessFields
					draft={draft}
					setDraft={setDraft as React.Dispatch<React.SetStateAction<BrowserlessEntry>>}
					disabled={disabled}
				/>
			)
		case 'flaresolverr':
			return (
				<FlaresolverrFields
					draft={draft}
					setDraft={setDraft as React.Dispatch<React.SetStateAction<FlaresolverrEntry>>}
					disabled={disabled}
				/>
			)
		case 'browserbase-fetch':
			return (
				<BrowserbaseFetchFields
					draft={draft}
					setDraft={setDraft as React.Dispatch<React.SetStateAction<BrowserbaseFetchEntry>>}
					disabled={disabled}
				/>
			)
		case 'browserbase-stagehand':
			return (
				<BrowserbaseStagehandFields
					draft={draft}
					setDraft={setDraft as React.Dispatch<React.SetStateAction<BrowserbaseStagehandEntry>>}
					disabled={disabled}
				/>
			)
		case 'custom-http':
			return (
				<CustomHttpFields draft={draft} setDraft={setDraft as React.Dispatch<React.SetStateAction<CustomHttpEntry>>} disabled={disabled} />
			)
		case 'ai':
			return <AiFields draft={draft} />
		case 'giftwrapt-scraper':
			return (
				<GiftWraptScraperFields
					draft={draft}
					setDraft={setDraft as React.Dispatch<React.SetStateAction<GiftWraptScraperEntry>>}
					disabled={disabled}
				/>
			)
		case 'scrapfly':
			return <ScrapflyFields draft={draft} setDraft={setDraft as React.Dispatch<React.SetStateAction<ScrapflyEntry>>} disabled={disabled} />
	}
}

function BrowserlessFields({
	draft,
	setDraft,
	disabled,
}: {
	draft: BrowserlessEntry
	setDraft: React.Dispatch<React.SetStateAction<BrowserlessEntry>>
	disabled: boolean
}) {
	return (
		<>
			<div className="space-y-1">
				<Label htmlFor={`browserless-url-${draft.id}`} className="text-base">
					Browserless URL
				</Label>
				<Input
					id={`browserless-url-${draft.id}`}
					type="url"
					placeholder="https://browserless.local"
					value={draft.url}
					disabled={disabled}
					maxLength={LIMITS.URL}
					onChange={e => setDraft(prev => ({ ...prev, url: e.target.value }))}
				/>
			</div>
			<SecretInput
				id={`browserless-token-${draft.id}`}
				label="Token (optional)"
				value={draft.token ?? ''}
				disabled={disabled}
				onChange={value => setDraft(prev => ({ ...prev, token: value || undefined }))}
				hint="Sent as x-browser-token header and ?token query param. Encrypted at rest."
			/>
		</>
	)
}

function FlaresolverrFields({
	draft,
	setDraft,
	disabled,
}: {
	draft: FlaresolverrEntry
	setDraft: React.Dispatch<React.SetStateAction<FlaresolverrEntry>>
	disabled: boolean
}) {
	return (
		<div className="space-y-1">
			<Label htmlFor={`flaresolverr-url-${draft.id}`} className="text-base">
				Flaresolverr URL
			</Label>
			<Input
				id={`flaresolverr-url-${draft.id}`}
				type="url"
				placeholder="https://flaresolverr.local"
				value={draft.url}
				disabled={disabled}
				maxLength={LIMITS.URL}
				onChange={e => setDraft(prev => ({ ...prev, url: e.target.value }))}
			/>
			<p className="text-xs text-muted-foreground mt-1">
				Use this only for sites behind a Cloudflare wall. For everything else, the built-in fetcher or Browserless is faster and cheaper.
			</p>
		</div>
	)
}

function BrowserbaseFetchFields({
	draft,
	setDraft,
	disabled,
}: {
	draft: BrowserbaseFetchEntry
	setDraft: React.Dispatch<React.SetStateAction<BrowserbaseFetchEntry>>
	disabled: boolean
}) {
	return (
		<>
			<SecretInput
				id={`bb-fetch-key-${draft.id}`}
				label="API Key"
				value={draft.apiKey}
				disabled={disabled}
				onChange={value => setDraft(prev => ({ ...prev, apiKey: value }))}
				hint={
					<>
						Browserbase API key from{' '}
						<a href="https://www.browserbase.com/settings" target="_blank" rel="noreferrer noopener" className="underline">
							browserbase.com/settings
						</a>
						. Encrypted at rest.
					</>
				}
			/>
			<div className="flex flex-col gap-3 @md/scraper-form:flex-row @md/scraper-form:gap-6">
				<SwitchRow
					id={`bb-fetch-proxies-${draft.id}`}
					label="Use proxies"
					hint="Routes the fetch through Browserbase's residential proxy network."
					checked={draft.proxies}
					disabled={disabled}
					onChange={value => setDraft(prev => ({ ...prev, proxies: value }))}
				/>
				<SwitchRow
					id={`bb-fetch-redirects-${draft.id}`}
					label="Allow redirects"
					hint="Follow 3xx responses to the final URL before returning the body."
					checked={draft.allowRedirects}
					disabled={disabled}
					onChange={value => setDraft(prev => ({ ...prev, allowRedirects: value }))}
				/>
			</div>
			<p className="text-xs text-muted-foreground">
				Uses Browserbase&apos;s Fetch API for fast rendered HTML. Best for static-ish pages where JS execution helps but extraction
				doesn&apos;t need an LLM.
			</p>
		</>
	)
}

function BrowserbaseStagehandFields({
	draft,
	setDraft,
	disabled,
}: {
	draft: BrowserbaseStagehandEntry
	setDraft: React.Dispatch<React.SetStateAction<BrowserbaseStagehandEntry>>
	disabled: boolean
}) {
	return (
		<>
			<SecretInput
				id={`bb-stage-key-${draft.id}`}
				label="API Key"
				value={draft.apiKey}
				disabled={disabled}
				onChange={value => setDraft(prev => ({ ...prev, apiKey: value }))}
				hint="Browserbase API key. Encrypted at rest."
			/>
			<div className="space-y-1">
				<Label htmlFor={`bb-stage-project-${draft.id}`} className="text-base">
					Project ID
				</Label>
				<Input
					id={`bb-stage-project-${draft.id}`}
					placeholder="bb_proj_..."
					value={draft.projectId}
					disabled={disabled}
					maxLength={200}
					onChange={e => setDraft(prev => ({ ...prev, projectId: e.target.value }))}
				/>
			</div>
			<div className="space-y-1">
				<Label htmlFor={`bb-stage-model-${draft.id}`} className="text-base">
					Model name (optional)
				</Label>
				<Input
					id={`bb-stage-model-${draft.id}`}
					placeholder="Inherits from /admin/ai-settings"
					value={draft.modelName ?? ''}
					disabled={disabled}
					maxLength={LIMITS.SHORT_NAME}
					onChange={e => setDraft(prev => ({ ...prev, modelName: e.target.value || undefined }))}
				/>
				<p className="text-xs text-muted-foreground mt-1">
					Override the LLM model used by Stagehand&apos;s extract(). Leave blank to inherit from the app&apos;s AI config (provider + model
					+ key).
				</p>
			</div>
			<div className="space-y-1">
				<div className="flex items-baseline justify-between gap-2">
					<Label htmlFor={`bb-stage-instr-${draft.id}`} className="text-base">
						Extraction instruction (optional)
					</Label>
					<CharacterCounter value={draft.instruction ?? ''} max={LIMITS.MEDIUM_TEXT} />
				</div>
				<Textarea
					id={`bb-stage-instr-${draft.id}`}
					rows={3}
					placeholder="Extract the product title, current price, currency, main image URLs, and the site's display name."
					value={draft.instruction ?? ''}
					disabled={disabled}
					maxLength={LIMITS.MEDIUM_TEXT}
					onChange={e => setDraft(prev => ({ ...prev, instruction: e.target.value || undefined }))}
				/>
				<p className="text-xs text-muted-foreground mt-1">
					Free-form natural-language hint for the extractor. Leave blank for the default product-page instruction.
				</p>
			</div>
			<p className="text-xs text-muted-foreground">
				Drives a real Browserbase session and uses Stagehand&apos;s extract() to produce a structured ScrapeResult. Slower and LLM-billable;
				runs in parallel with the rest of the chain.
			</p>
		</>
	)
}

function GiftWraptScraperFields({
	draft,
	setDraft,
	disabled,
}: {
	draft: GiftWraptScraperEntry
	setDraft: React.Dispatch<React.SetStateAction<GiftWraptScraperEntry>>
	disabled: boolean
}) {
	return (
		<>
			<div className="space-y-1">
				<Label htmlFor={`wls-endpoint-${draft.id}`} className="text-base">
					Endpoint
				</Label>
				<Input
					id={`wls-endpoint-${draft.id}`}
					type="url"
					placeholder="https://browser-services.local"
					value={draft.endpoint}
					disabled={disabled}
					maxLength={LIMITS.URL}
					onChange={e => setDraft(prev => ({ ...prev, endpoint: e.target.value }))}
				/>
				{IS_DEV ? (
					<p className="text-xs text-muted-foreground mt-1">
						Base URL of your deployed{' '}
						<a href="https://github.com/shawnphoffman/giftwrapt-scraper" target="_blank" rel="noreferrer noopener" className="underline">
							giftwrapt-scraper
						</a>{' '}
						facade.
					</p>
				) : (
					<p className="text-xs text-muted-foreground mt-1">Base URL of your deployed giftwrapt-scraper facade.</p>
				)}
			</div>
			<SecretInput
				id={`wls-token-${draft.id}`}
				label="Token"
				value={draft.token}
				disabled={disabled}
				onChange={value => setDraft(prev => ({ ...prev, token: value }))}
				hint={
					<>
						Sent as <code className="font-mono">X-Browser-Token</code> on every request. Encrypted at rest.
					</>
				}
			/>
		</>
	)
}

function ScrapflyFields({
	draft,
	setDraft,
	disabled,
}: {
	draft: ScrapflyEntry
	setDraft: React.Dispatch<React.SetStateAction<ScrapflyEntry>>
	disabled: boolean
}) {
	return (
		<>
			<SecretInput
				id={`scrapfly-key-${draft.id}`}
				label="API Key"
				value={draft.apiKey}
				disabled={disabled}
				onChange={value => setDraft(prev => ({ ...prev, apiKey: value }))}
				hint={
					<>
						ScrapFly API key from{' '}
						<a href="https://scrapfly.io/dashboard" target="_blank" rel="noreferrer noopener" className="underline">
							scrapfly.io/dashboard
						</a>
						. Encrypted at rest.
					</>
				}
			/>
			<div className="flex flex-col gap-3">
				<SwitchRow
					id={`scrapfly-asp-${draft.id}`}
					label="Anti-scraping protection"
					hint="Sends asp=true. Bypasses most bot walls; costs more credits per call."
					checked={draft.asp}
					disabled={disabled}
					onChange={value => setDraft(prev => ({ ...prev, asp: value }))}
				/>
				<SwitchRow
					id={`scrapfly-renderjs-${draft.id}`}
					label="Render JavaScript"
					hint="Sends render_js=true to drive a headless browser. Slower and significantly more credits per call."
					checked={draft.renderJs}
					disabled={disabled}
					onChange={value => setDraft(prev => ({ ...prev, renderJs: value }))}
				/>
			</div>
		</>
	)
}

function AiFields({ draft: _draft }: { draft: AiEntry }) {
	return (
		<p className="text-xs text-muted-foreground">
			Uses the AI provider configured under <code className="font-mono">/admin/ai-settings</code> (provider type, model, API key). Each
			scrape fires its own fetch + LLM call; costs money per scrape. Best at higher tiers as a fallback when cheaper providers fall through.
		</p>
	)
}

function CustomHttpFields({
	draft,
	setDraft,
	disabled,
}: {
	draft: CustomHttpEntry
	setDraft: React.Dispatch<React.SetStateAction<CustomHttpEntry>>
	disabled: boolean
}) {
	return (
		<>
			<div className="space-y-1">
				<Label htmlFor={`custom-endpoint-${draft.id}`} className="text-base">
					Endpoint
				</Label>
				<Input
					id={`custom-endpoint-${draft.id}`}
					type="url"
					placeholder="https://my-scraper.local/scrape"
					value={draft.endpoint}
					disabled={disabled}
					maxLength={LIMITS.URL}
					onChange={e => setDraft(prev => ({ ...prev, endpoint: e.target.value }))}
				/>
			</div>
			<div className="space-y-1">
				<Label htmlFor={`custom-kind-${draft.id}`} className="text-base">
					Response kind
				</Label>
				<Select
					value={draft.responseKind}
					disabled={disabled}
					onValueChange={(v: string) => setDraft(prev => ({ ...prev, responseKind: v as 'html' | 'json' }))}
				>
					<SelectTrigger id={`custom-kind-${draft.id}`} className="w-full sm:w-[280px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="html">HTML (extract locally)</SelectItem>
						<SelectItem value="json">JSON (ScrapeResult shape)</SelectItem>
					</SelectContent>
				</Select>
				<ResponseKindHelp kind={draft.responseKind} />
			</div>
			<div className="space-y-1">
				<div className="flex items-baseline justify-between gap-2">
					<Label htmlFor={`custom-headers-${draft.id}`} className="text-base">
						Custom HTTP headers
					</Label>
					<CharacterCounter value={draft.customHeaders ?? ''} max={LIMITS.HEADERS_JSON} />
				</div>
				<p className="text-xs text-muted-foreground">
					Sent on every request to this scraper. One <code className="font-mono">Header-Name: value</code> per line. Blank lines and{' '}
					<code className="font-mono">#</code>-prefixed comments are ignored. Encrypted at rest (often carries bearer tokens).
				</p>
				<Textarea
					id={`custom-headers-${draft.id}`}
					rows={5}
					placeholder={'X-Scrape-Token: abc123\nAuthorization: Bearer xyz'}
					value={draft.customHeaders ?? ''}
					disabled={disabled}
					maxLength={LIMITS.HEADERS_JSON}
					className="font-mono text-xs"
					onChange={e => setDraft(prev => ({ ...prev, customHeaders: e.target.value || undefined }))}
				/>
			</div>
		</>
	)
}

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

function SecretInput({
	id,
	label,
	value,
	disabled,
	onChange,
	hint,
	maxLength = LIMITS.SECRET,
}: {
	id: string
	label: string
	value: string
	disabled: boolean
	onChange: (value: string) => void
	hint?: React.ReactNode
	maxLength?: number
}) {
	return (
		<div className="space-y-1">
			<Label htmlFor={id} className="text-base">
				{label}
			</Label>
			<Input
				id={id}
				type="password"
				autoComplete="off"
				value={value}
				disabled={disabled}
				maxLength={maxLength}
				onChange={e => onChange(e.target.value)}
			/>
			{hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
		</div>
	)
}

function SwitchRow({
	id,
	label,
	hint,
	checked,
	disabled,
	onChange,
}: {
	id: string
	label: string
	hint?: string
	checked: boolean
	disabled: boolean
	onChange: (value: boolean) => void
}) {
	return (
		<div className="flex items-start gap-2">
			<Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
			<div className="space-y-0.5">
				<Label htmlFor={id} className="text-sm font-medium">
					{label}
				</Label>
				{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
			</div>
		</div>
	)
}

function ResponseKindHelp({ kind }: { kind: 'html' | 'json' }) {
	if (kind === 'html') {
		return (
			<p className="text-xs text-muted-foreground mt-1">
				Return the raw HTML body of the page (a <code className="font-mono">text/html</code> response). The orchestrator runs the same OG /
				JSON-LD / microdata extractor it uses for the built-in fetcher.
			</p>
		)
	}
	// Native <details> for the schema reference: the prose hint is always
	// visible (admins need the "missing fields = not provided" caveat) but
	// the JSON example is hidden behind a click so it doesn't dominate the
	// card while the admin is configuring the scraper.
	return (
		<div className="space-y-1 mt-1">
			<p className="text-xs text-muted-foreground">
				Return JSON with the <code className="font-mono">ScrapeResult</code> shape. Unknown fields are ignored; missing fields are treated
				as &quot;not provided.&quot; All fields are optional; a response with at least <code className="font-mono">title</code> or{' '}
				<code className="font-mono">imageUrls[0]</code> typically scores well enough to win.
			</p>
			<details className="group rounded-md border bg-muted/30">
				<summary className="cursor-pointer select-none list-none px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5">
					<span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">
						▶
					</span>
					Expected JSON response shape
				</summary>
				<pre className="text-xs bg-muted/50 rounded-b-md p-2 overflow-x-auto font-mono leading-snug border-t">
					{`{
  "title":       string,           // optional
  "description": string,           // optional
  "price":       string,           // optional, human-readable
  "currency":    string,           // optional, e.g. "USD"
  "imageUrls":   string[],         // optional, absolute URLs preferred
  "siteName":    string,           // optional
  "finalUrl":    string            // optional, original is used otherwise
}`}
				</pre>
			</details>
		</div>
	)
}

// Optional per-entry override for the orchestrator's per-provider timeout.
// Empty input commits as `undefined`, which the server schema treats as
// "inherit the global scrapeProviderTimeoutMs".
function TimeoutOverrideRow({
	draft,
	setDraft,
	disabled,
}: {
	draft: ScrapeProviderEntry
	setDraft: React.Dispatch<React.SetStateAction<ScrapeProviderEntry>>
	disabled: boolean
}) {
	const id = `scraper-timeout-${draft.id}`
	const formatForDisplay = (ms: number | undefined): string => (ms === undefined ? '' : String(ms / 1000))
	const [text, setText] = useState(formatForDisplay(draft.timeoutMs))

	useEffect(() => {
		setText(formatForDisplay(draft.timeoutMs))
	}, [draft.timeoutMs])

	const commit = () => {
		const trimmed = text.trim()
		if (trimmed === '') {
			if (draft.timeoutMs !== undefined) {
				setDraft(prev => ({ ...prev, timeoutMs: undefined }) as ScrapeProviderEntry)
			}
			setText('')
			return
		}
		const parsed = Number.parseFloat(trimmed)
		if (!Number.isFinite(parsed) || parsed <= 0) {
			setText(formatForDisplay(draft.timeoutMs))
			return
		}
		const stored = Math.min(TIMEOUT_OVERRIDE_MAX_MS, Math.max(1, Math.round(parsed * 1000)))
		if (stored !== draft.timeoutMs) {
			setDraft(prev => ({ ...prev, timeoutMs: stored }) as ScrapeProviderEntry)
		}
		setText(String(stored / 1000))
	}

	return (
		<div className="space-y-1.5">
			<Label htmlFor={id} className="text-base">
				Timeout override (optional)
			</Label>
			<div className="relative w-full sm:max-w-xs">
				<Input
					id={id}
					type="number"
					inputMode="numeric"
					min={1}
					max={TIMEOUT_OVERRIDE_MAX_MS / 1000}
					step="any"
					value={text}
					placeholder="Inherit global timeout"
					disabled={disabled}
					className="pr-10"
					onChange={e => setText(e.target.value)}
					onBlur={commit}
					onKeyDown={e => {
						if (e.key === 'Enter') {
							e.preventDefault()
							commit()
						}
					}}
				/>
				<span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">s</span>
			</div>
			<p className="text-xs text-muted-foreground">
				Leave blank to use the global per-provider timeout above. Set a longer value for slow scrapers (Stagehand, AI) without bumping every
				other provider&apos;s budget.
			</p>
		</div>
	)
}

function isSameEntry(a: ScrapeProviderEntry, b: ScrapeProviderEntry): boolean {
	if (
		a.id !== b.id ||
		a.type !== b.type ||
		a.name !== b.name ||
		a.enabled !== b.enabled ||
		a.tier !== b.tier ||
		a.timeoutMs !== b.timeoutMs
	)
		return false
	switch (a.type) {
		case 'browserless':
			return b.type === 'browserless' && a.url === b.url && (a.token ?? '') === (b.token ?? '')
		case 'flaresolverr':
			return b.type === 'flaresolverr' && a.url === b.url
		case 'browserbase-fetch':
			return b.type === 'browserbase-fetch' && a.apiKey === b.apiKey && a.proxies === b.proxies && a.allowRedirects === b.allowRedirects
		case 'browserbase-stagehand':
			return (
				b.type === 'browserbase-stagehand' &&
				a.apiKey === b.apiKey &&
				a.projectId === b.projectId &&
				(a.modelName ?? '') === (b.modelName ?? '') &&
				(a.instruction ?? '') === (b.instruction ?? '')
			)
		case 'custom-http':
			return (
				b.type === 'custom-http' &&
				a.endpoint === b.endpoint &&
				a.responseKind === b.responseKind &&
				(a.customHeaders ?? '') === (b.customHeaders ?? '')
			)
		case 'ai':
			return b.type === 'ai'
		case 'giftwrapt-scraper':
			return b.type === 'giftwrapt-scraper' && a.endpoint === b.endpoint && a.token === b.token
		case 'scrapfly':
			return b.type === 'scrapfly' && a.apiKey === b.apiKey && a.asp === b.asp && a.renderJs === b.renderJs
	}
}

// ---------------------------------------------------------------------------
// Number input that commits on blur (or Enter) so we don't fire a mutation
// per keystroke. Used for the timing knobs at the top of the form.
// ---------------------------------------------------------------------------

function NumberRow({
	id,
	label,
	hint,
	suffix,
	value,
	min,
	multiplier = 1,
	disabled,
	onCommit,
}: {
	id: string
	label: string
	hint: string
	suffix?: string
	value: number
	min?: number
	multiplier?: number
	disabled: boolean
	onCommit: (value: number) => void
}) {
	const formatForDisplay = (raw: number): string => String(multiplier === 1 ? raw : raw / multiplier)
	const [draft, setDraft] = useState(formatForDisplay(value))

	useEffect(() => {
		setDraft(String(multiplier === 1 ? value : value / multiplier))
	}, [value, multiplier])

	const commit = () => {
		const parsed = Number.parseFloat(draft)
		if (!Number.isFinite(parsed)) {
			setDraft(formatForDisplay(value))
			return
		}
		const stored = Math.round(parsed * multiplier)
		const lower = typeof min === 'number' ? min : 1
		const clampedStored = Math.max(lower, stored)
		if (clampedStored !== value) onCommit(clampedStored)
		setDraft(formatForDisplay(clampedStored))
	}

	return (
		<div className="flex flex-col gap-2 @md/scraper-form:flex-row @md/scraper-form:items-center @md/scraper-form:justify-between @md/scraper-form:gap-4">
			<div className="space-y-0.5">
				<Label htmlFor={id} className="text-base">
					{label}
				</Label>
				<p className="text-sm text-muted-foreground">{hint}</p>
			</div>
			<div className="flex items-center gap-2 shrink-0">
				<Input
					id={id}
					type="number"
					inputMode="numeric"
					value={draft}
					min={typeof min === 'number' ? min / multiplier : undefined}
					step={multiplier === 1 ? 1 : 'any'}
					disabled={disabled}
					className="w-32"
					onChange={e => setDraft(e.target.value)}
					onBlur={commit}
					onKeyDown={e => {
						if (e.key === 'Enter') {
							e.preventDefault()
							commit()
						}
					}}
				/>
				{suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
			</div>
		</div>
	)
}
