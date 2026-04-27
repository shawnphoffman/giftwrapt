import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { AppSettings } from '@/lib/settings'

// Presentational form for scraper-related app settings: timeouts, cache TTL,
// quality threshold, and the custom-HTTP provider config. Pure props in,
// per-key callback out so it can render in Storybook without dragging in
// server-fn imports. The data-aware wrapper next to this file wires it up
// to the live settings hooks.

export type ScraperProvidersFormViewProps = {
	settings: Pick<
		AppSettings,
		'scrapeProviderTimeoutMs' | 'scrapeOverallTimeoutMs' | 'scrapeQualityThreshold' | 'scrapeCacheTtlHours' | 'scrapeCustomHttpProviders'
	>
	disabled?: boolean
	onChange: <TKey extends ScraperProvidersFormChangeKey>(key: TKey, value: AppSettings[TKey]) => void
}

export type ScraperProvidersFormChangeKey =
	| 'scrapeProviderTimeoutMs'
	| 'scrapeOverallTimeoutMs'
	| 'scrapeQualityThreshold'
	| 'scrapeCacheTtlHours'
	| 'scrapeCustomHttpProviders'

export function ScraperProvidersFormView({ settings, disabled, onChange }: ScraperProvidersFormViewProps) {
	const inputDisabled = disabled === true

	// `@container/scraper-form` on the outermost div scopes our container
	// queries to the form's actual rendered width (not the admin page or
	// browser viewport). Rows stack vertically below ~28rem and reflow
	// side-by-side once the form has room.
	return (
		<div className="@container/scraper-form space-y-8">
			<div className="space-y-1">
				<h3 className="text-base font-medium">Scraping</h3>
				<p className="text-sm text-muted-foreground">
					Tune the scraping pipeline. The built-in fetch provider is always on; the rest light up when their env vars or config are set.
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

			<CustomHttpProvidersSection
				entries={settings.scrapeCustomHttpProviders}
				disabled={inputDisabled}
				onChange={next => onChange('scrapeCustomHttpProviders', next)}
			/>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Custom HTTP providers section (0:N entries)
// ---------------------------------------------------------------------------

type CustomHttpEntry = AppSettings['scrapeCustomHttpProviders'][number]

const MAX_ENTRIES = 16

function CustomHttpProvidersSection({
	entries,
	disabled,
	onChange,
}: {
	entries: ReadonlyArray<CustomHttpEntry>
	disabled: boolean
	onChange: (next: Array<CustomHttpEntry>) => void
}) {
	const add = () => {
		if (entries.length >= MAX_ENTRIES) return
		const next: CustomHttpEntry = {
			id: makeEntryId(),
			name: `Scraper ${entries.length + 1}`,
			enabled: true,
			endpoint: '',
			responseKind: 'html',
		}
		onChange([...entries, next])
	}

	const replace = (id: string, next: CustomHttpEntry) => {
		onChange(entries.map(e => (e.id === id ? next : e)))
	}

	const remove = (id: string) => {
		onChange(entries.filter(e => e.id !== id))
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-3 @md/scraper-form:flex-row @md/scraper-form:items-end @md/scraper-form:justify-between @md/scraper-form:gap-4">
				<div className="space-y-0.5">
					<Label className="text-base">Custom HTTP scrapers</Label>
					<p className="text-sm text-muted-foreground">
						Point the orchestrator at your own scraper services. Each one GETs{' '}
						<code className="font-mono">{'{endpoint}?url=<encoded>'}</code> and reads the response per its response kind. Add as many as you
						need; the orchestrator runs them in the order shown after the built-in providers.
					</p>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={disabled || entries.length >= MAX_ENTRIES}
					onClick={add}
					className="gap-1.5 self-start @md/scraper-form:self-auto"
				>
					<Plus className="size-3.5" />
					Add scraper
				</Button>
			</div>

			{entries.length === 0 ? (
				<p className="text-sm text-muted-foreground italic">No custom scrapers configured. Click &quot;Add scraper&quot; to wire one up.</p>
			) : (
				<div className="space-y-3">
					{entries.map(entry => (
						<CustomHttpEntryCard
							key={entry.id}
							entry={entry}
							disabled={disabled}
							onSave={next => replace(entry.id, next)}
							onRemove={() => remove(entry.id)}
						/>
					))}
				</div>
			)}
		</div>
	)
}

function CustomHttpEntryCard({
	entry,
	disabled,
	onSave,
	onRemove,
}: {
	entry: CustomHttpEntry
	disabled: boolean
	onSave: (next: CustomHttpEntry) => void
	onRemove: () => void
}) {
	// Each card holds its own draft. Field changes update local state only;
	// nothing reaches `appSettings` until the admin clicks Save. The draft
	// resets if a different entry is mounted in this slot (the parent uses
	// `entry.id` as the React key, so new ids force a remount with a fresh
	// draft seeded from the latest props).
	const [draft, setDraft] = useState<CustomHttpEntry>(entry)
	const dirty = !isSameEntry(draft, entry)

	const update = <TKey extends keyof CustomHttpEntry>(key: TKey, value: CustomHttpEntry[TKey]) => {
		setDraft(prev => ({ ...prev, [key]: value }))
	}

	const reset = () => setDraft(entry)
	const save = () => {
		// Empty name shouldn't save - fall back to whatever was there.
		const trimmedName = draft.name.trim() || entry.name
		onSave({ ...draft, name: trimmedName })
	}

	return (
		<div className="rounded-md border p-4 space-y-4">
			<div className="flex flex-col gap-3 @md/scraper-form:flex-row @md/scraper-form:items-end @md/scraper-form:gap-3">
				<div className="flex-1 min-w-0 space-y-1">
					<Label htmlFor={`scrapeCustomHttpName-${entry.id}`} className="text-base">
						Name
					</Label>
					<Input
						id={`scrapeCustomHttpName-${entry.id}`}
						placeholder="My Amazon scraper"
						value={draft.name}
						disabled={disabled}
						onChange={e => update('name', e.target.value)}
					/>
				</div>
				<div className="flex items-center justify-between gap-2 @md/scraper-form:justify-start">
					<Switch
						id={`scrapeCustomHttpEnabled-${entry.id}`}
						checked={draft.enabled}
						disabled={disabled}
						onCheckedChange={(checked: boolean) => update('enabled', checked)}
						aria-label={draft.enabled ? `Disable ${entry.name}` : `Enable ${entry.name}`}
					/>
					<Button type="button" variant="ghost" size="icon" disabled={disabled} onClick={onRemove} aria-label={`Remove ${entry.name}`}>
						<Trash2 className="size-4 text-muted-foreground" />
					</Button>
				</div>
			</div>

			<div className="space-y-1">
				<Label htmlFor={`scrapeCustomHttpEndpoint-${entry.id}`} className="text-base">
					Endpoint
				</Label>
				<Input
					id={`scrapeCustomHttpEndpoint-${entry.id}`}
					type="url"
					placeholder="https://my-scraper.local/scrape"
					value={draft.endpoint}
					disabled={disabled}
					onChange={e => update('endpoint', e.target.value)}
				/>
			</div>

			<div className="space-y-1">
				<Label htmlFor={`scrapeCustomHttpResponseKind-${entry.id}`} className="text-base">
					Response kind
				</Label>
				<Select value={draft.responseKind} disabled={disabled} onValueChange={(v: string) => update('responseKind', v as 'html' | 'json')}>
					<SelectTrigger id={`scrapeCustomHttpResponseKind-${entry.id}`} className="w-[200px]">
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
				<Label htmlFor={`scrapeCustomHttpHeaders-${entry.id}`} className="text-base">
					Custom HTTP headers
				</Label>
				<p className="text-xs text-muted-foreground">
					Sent on every request to this scraper. One <code className="font-mono">Header-Name: value</code> per line. Blank lines and{' '}
					<code className="font-mono">#</code>-prefixed comments are ignored.
				</p>
				<Textarea
					id={`scrapeCustomHttpHeaders-${entry.id}`}
					rows={5}
					placeholder={'X-Scrape-Token: abc123\nAuthorization: Bearer xyz'}
					value={draft.customHeaders ?? ''}
					disabled={disabled}
					className="font-mono text-xs"
					onChange={e => update('customHeaders', e.target.value || undefined)}
				/>
			</div>

			<div className="flex items-center justify-end gap-2 pt-1 border-t -mx-4 px-4">
				{dirty && <span className="mr-auto text-xs text-muted-foreground italic">Unsaved changes</span>}
				<Button type="button" variant="ghost" size="sm" disabled={disabled || !dirty} onClick={reset}>
					Reset
				</Button>
				<Button type="button" size="sm" disabled={disabled || !dirty} onClick={save}>
					Save
				</Button>
			</div>
		</div>
	)
}

function isSameEntry(a: CustomHttpEntry, b: CustomHttpEntry): boolean {
	return (
		a.id === b.id &&
		a.name === b.name &&
		a.enabled === b.enabled &&
		a.endpoint === b.endpoint &&
		a.responseKind === b.responseKind &&
		(a.customHeaders ?? '') === (b.customHeaders ?? '')
	)
}

// Stable, opaque id for a new entry. Kept short so it doesn't bloat the
// per-row data attributes; uniqueness within ~16 entries is plenty.
function makeEntryId(): string {
	return Math.random().toString(36).slice(2, 10)
}

// ---------------------------------------------------------------------------
// Help copy that documents what the orchestrator expects back from the
// custom-HTTP provider in each response mode.
// ---------------------------------------------------------------------------

function ResponseKindHelp({ kind }: { kind: 'html' | 'json' }) {
	if (kind === 'html') {
		return (
			<p className="text-xs text-muted-foreground mt-1">
				Return the raw HTML body of the page (a <code className="font-mono">text/html</code> response). The orchestrator runs the same OG /
				JSON-LD / microdata extractor it uses for the built-in fetcher, so anything that looks like a normal product page works.
			</p>
		)
	}
	return (
		<div className="space-y-1 mt-1">
			<p className="text-xs text-muted-foreground">
				Return JSON with the shape below. Unknown fields are ignored; missing fields are treated as &quot;not provided.&quot; All fields are
				optional; a response with at least <code className="font-mono">title</code> or <code className="font-mono">imageUrls[0]</code>{' '}
				typically scores well enough to win.
			</p>
			<pre className="text-xs bg-muted/50 rounded-md p-2 overflow-x-auto font-mono leading-snug">
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
		</div>
	)
}

// ---------------------------------------------------------------------------
// Inputs that commit on blur (or Enter) so we don't fire a mutation per
// keystroke.
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
	// `multiplier=1000` lets the form display seconds while the underlying
	// setting is stored in milliseconds: the input shows value/1000 and
	// commits parsed*1000. Defaults to 1 (no conversion).
	multiplier?: number
	disabled: boolean
	onCommit: (value: number) => void
}) {
	const formatForDisplay = (raw: number): string => String(multiplier === 1 ? raw : raw / multiplier)
	const [draft, setDraft] = useState(formatForDisplay(value))

	useEffect(() => {
		// We deliberately re-render only when the upstream value or unit
		// multiplier changes; recomputing the formatted string here is cheap
		// and stays in sync with both knobs.
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
