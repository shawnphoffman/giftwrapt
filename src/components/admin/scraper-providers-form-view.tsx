import { closestCenter, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronRight, GripVertical, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
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
	ScrapeProviderEntry,
	ScrapeProviderType,
	WishListScraperEntry,
} from '@/lib/settings'

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

export type ScraperProvidersFormChangeKey =
	| 'scrapeProviderTimeoutMs'
	| 'scrapeOverallTimeoutMs'
	| 'scrapeQualityThreshold'
	| 'scrapeCacheTtlHours'
	| 'scrapeProviders'

export function ScraperProvidersFormView({ settings, disabled, onChange }: ScraperProvidersFormViewProps) {
	const inputDisabled = disabled === true

	return (
		<div className="@container/scraper-form space-y-8">
			<div className="space-y-1">
				<h3 className="text-base font-medium">Scraping</h3>
				<p className="text-sm text-muted-foreground">
					Tune the scraping pipeline. The built-in fetch provider is always on; everything else is configured below and runs in the order
					shown. Drag the handle on the left to reorder.
				</p>
			</div>

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

			<Separator />

			<ScrapeProvidersSection
				entries={settings.scrapeProviders}
				disabled={inputDisabled}
				onChange={next => onChange('scrapeProviders', next)}
			/>
		</div>
	)
}

// `import.meta.env.DEV` is true in `vite dev` and false in production
// builds. We hide the public GitHub link to the wish-list-scraper repo
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
	'wish-list-scraper': 'Wish List Scraper',
}

const ADD_OPTIONS: Array<{ type: ScrapeProviderType; label: string; hint: string }> = [
	{ type: 'browserless', label: 'Browserless', hint: 'Self-hosted JS-rendering container' },
	{ type: 'flaresolverr', label: 'Flaresolverr', hint: 'Self-hosted Cloudflare bypass' },
	{ type: 'browserbase-fetch', label: 'Browserbase (Fetch API)', hint: 'Hosted: rendered HTML, no LLM' },
	{ type: 'browserbase-stagehand', label: 'Browserbase (Stagehand)', hint: 'Hosted: structured extraction with LLM' },
	{ type: 'custom-http', label: 'Custom HTTP', hint: 'Bring your own scraper service' },
	{ type: 'ai', label: 'AI extraction', hint: 'LLM extracts from any HTML; uses /admin/ai-settings creds' },
	{
		type: 'wish-list-scraper',
		label: 'Wish List Scraper',
		hint: 'Self-hosted Hono facade chaining browserless / flaresolverr / byparr / scrapfly',
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
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	)

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

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event
		if (!over || active.id === over.id) return
		const from = entries.findIndex(e => e.id === active.id)
		const to = entries.findIndex(e => e.id === over.id)
		if (from < 0 || to < 0) return
		onChange(arrayMove([...entries], from, to))
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-3 @md/scraper-form:flex-row @md/scraper-form:items-end @md/scraper-form:justify-between @md/scraper-form:gap-4">
				<div className="space-y-0.5">
					<Label className="text-base">Scrape providers</Label>
					<p className="text-sm text-muted-foreground">
						Each entry runs only when configured and enabled. Tier 1 entries fire in parallel; the chain advances to tier 2 only if tier
						1&apos;s merged result falls below the quality threshold, and so on. Drag to reorder within a tier; pick a tier to move an entry
						between tiers.
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
						{ADD_OPTIONS.map(opt => (
							<DropdownMenuItem key={opt.type} onSelect={() => handleAdd(opt.type)}>
								<div className="flex flex-col gap-0.5">
									<span>{opt.label}</span>
									<span className="text-xs text-muted-foreground">{opt.hint}</span>
								</div>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{entries.length === 0 ? (
				<p className="text-sm text-muted-foreground italic">No scrapers configured. Click &quot;Add scraper&quot; to wire one up.</p>
			) : (
				<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
					<SortableContext items={entries.map(e => e.id)} strategy={verticalListSortingStrategy}>
						<div className="space-y-3">
							{entries.map((entry, index) => {
								const prevTier = index > 0 ? entries[index - 1].tier : null
								const showDivider = prevTier !== null && prevTier !== entry.tier
								return (
									<div key={entry.id}>
										{showDivider && <TierDivider tier={entry.tier} />}
										<SortableEntryCard
											entry={entry}
											disabled={disabled}
											onSave={next => handleReplace(entry.id, next)}
											onRemove={() => handleRemove(entry.id)}
										/>
									</div>
								)
							})}
						</div>
					</SortableContext>
				</DndContext>
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
		case 'wish-list-scraper':
			return { type, id, name: `Wish List Scraper ${ordinal}`, enabled: false, tier: 1, endpoint: '', token: '' }
	}
}

// Stable, opaque id for a new entry. Kept short so it doesn't bloat the
// per-row data attributes; uniqueness within ~16 entries is plenty.
function makeEntryId(): string {
	return Math.random().toString(36).slice(2, 10)
}

// ---------------------------------------------------------------------------
// Sortable wrapper around the per-entry card
// ---------------------------------------------------------------------------

function SortableEntryCard({
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
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id })
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	}
	return (
		<div ref={setNodeRef} style={style}>
			<EntryCard entry={entry} disabled={disabled} onSave={onSave} onRemove={onRemove} dragHandleProps={{ ...attributes, ...listeners }} />
		</div>
	)
}

// ---------------------------------------------------------------------------
// Per-entry card (shell + type-specific body)
// ---------------------------------------------------------------------------

// Spread of `attributes` + `listeners` from useSortable. Typed loosely
// because dnd-kit's exported types intersect awkwardly when merged.
type DragHandleProps = Record<string, unknown>

function EntryCard({
	entry,
	disabled,
	onSave,
	onRemove,
	dragHandleProps,
}: {
	entry: ScrapeProviderEntry
	disabled: boolean
	onSave: (next: ScrapeProviderEntry) => void
	onRemove: () => void
	dragHandleProps: DragHandleProps
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

	return (
		<Collapsible open={open || dirty} onOpenChange={setOpen} className="rounded-md border">
			<div className="flex items-center gap-2 p-3">
				<button
					type="button"
					{...dragHandleProps}
					className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground p-1 -ml-1"
					aria-label={`Drag to reorder ${entry.name}`}
				>
					<GripVertical className="size-4" />
				</button>
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

			<CollapsibleContent className="space-y-4 px-4 pb-4 pt-1 border-t">
				<div className="space-y-1.5 pt-3">
					<Label htmlFor={`scraper-name-${entry.id}`} className="text-base">
						Name
					</Label>
					<Input
						id={`scraper-name-${entry.id}`}
						placeholder={TYPE_LABELS[entry.type]}
						value={draft.name}
						disabled={disabled}
						onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))}
					/>
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
		case 'wish-list-scraper':
			return (
				<WishListScraperFields
					draft={draft}
					setDraft={setDraft as React.Dispatch<React.SetStateAction<WishListScraperEntry>>}
					disabled={disabled}
				/>
			)
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
					onChange={e => setDraft(prev => ({ ...prev, modelName: e.target.value || undefined }))}
				/>
				<p className="text-xs text-muted-foreground mt-1">
					Override the LLM model used by Stagehand&apos;s extract(). Leave blank to inherit from the app&apos;s AI config (provider + model
					+ key).
				</p>
			</div>
			<div className="space-y-1">
				<Label htmlFor={`bb-stage-instr-${draft.id}`} className="text-base">
					Extraction instruction (optional)
				</Label>
				<Textarea
					id={`bb-stage-instr-${draft.id}`}
					rows={3}
					placeholder="Extract the product title, current price, currency, main image URLs, and the site's display name."
					value={draft.instruction ?? ''}
					disabled={disabled}
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

function WishListScraperFields({
	draft,
	setDraft,
	disabled,
}: {
	draft: WishListScraperEntry
	setDraft: React.Dispatch<React.SetStateAction<WishListScraperEntry>>
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
					onChange={e => setDraft(prev => ({ ...prev, endpoint: e.target.value }))}
				/>
				{IS_DEV ? (
					<p className="text-xs text-muted-foreground mt-1">
						Base URL of your deployed{' '}
						<a href="https://github.com/shawnphoffman/wish-list-scraper" target="_blank" rel="noreferrer noopener" className="underline">
							wish-list-scraper
						</a>{' '}
						facade. We POST <code className="font-mono">/fetch</code> against it; auto-mode chains browserless → flaresolverr → byparr →
						scrapfly server-side.
					</p>
				) : (
					<p className="text-xs text-muted-foreground mt-1">
						Base URL of your deployed wish-list-scraper facade. We POST <code className="font-mono">/fetch</code> against it.
					</p>
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
						Sent as <code className="font-mono">X-Browser-Token</code> on every request. Matches the{' '}
						<code className="font-mono">BROWSER_TOKEN</code> env on the facade. Encrypted at rest.
					</>
				}
			/>
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
				<Label htmlFor={`custom-headers-${draft.id}`} className="text-base">
					Custom HTTP headers
				</Label>
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
}: {
	id: string
	label: string
	value: string
	disabled: boolean
	onChange: (value: string) => void
	hint?: React.ReactNode
}) {
	return (
		<div className="space-y-1">
			<Label htmlFor={id} className="text-base">
				{label}
			</Label>
			<Input id={id} type="password" autoComplete="off" value={value} disabled={disabled} onChange={e => onChange(e.target.value)} />
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

function isSameEntry(a: ScrapeProviderEntry, b: ScrapeProviderEntry): boolean {
	if (a.id !== b.id || a.type !== b.type || a.name !== b.name || a.enabled !== b.enabled || a.tier !== b.tier) return false
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
		case 'wish-list-scraper':
			return b.type === 'wish-list-scraper' && a.endpoint === b.endpoint && a.token === b.token
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
