import { useEffect, useState } from 'react'

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
		'scrapeProviderTimeoutMs' | 'scrapeOverallTimeoutMs' | 'scrapeQualityThreshold' | 'scrapeCacheTtlHours' | 'scrapeCustomHttpProvider'
	>
	disabled?: boolean
	onChange: <TKey extends ScraperProvidersFormChangeKey>(key: TKey, value: AppSettings[TKey]) => void
}

export type ScraperProvidersFormChangeKey =
	| 'scrapeProviderTimeoutMs'
	| 'scrapeOverallTimeoutMs'
	| 'scrapeQualityThreshold'
	| 'scrapeCacheTtlHours'
	| 'scrapeCustomHttpProvider'

export function ScraperProvidersFormView({ settings, disabled, onChange }: ScraperProvidersFormViewProps) {
	const inputDisabled = disabled === true

	return (
		<div className="space-y-8">
			<div className="space-y-1">
				<h3 className="text-base font-medium">Scraping</h3>
				<p className="text-sm text-muted-foreground">
					Tune the scraping pipeline. The built-in fetch provider is always on; the rest light up when their env vars or config are set.
				</p>
			</div>

			<NumberRow
				id="scrapeProviderTimeoutMs"
				label="Per-provider timeout"
				suffix="ms"
				hint="Maximum time any one provider has to return before the orchestrator gives up on it and tries the next one."
				value={settings.scrapeProviderTimeoutMs}
				disabled={inputDisabled}
				onCommit={value => onChange('scrapeProviderTimeoutMs', value)}
			/>
			<NumberRow
				id="scrapeOverallTimeoutMs"
				label="Overall scrape budget"
				suffix="ms"
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

			<CustomHttpSection
				value={settings.scrapeCustomHttpProvider}
				disabled={inputDisabled}
				onChange={value => onChange('scrapeCustomHttpProvider', value)}
			/>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Custom HTTP provider sub-section
// ---------------------------------------------------------------------------

type CustomHttpConfig = NonNullable<AppSettings['scrapeCustomHttpProvider']>

const DEFAULT_CUSTOM: CustomHttpConfig = {
	enabled: false,
	endpoint: '',
	responseKind: 'html',
}

function CustomHttpSection({
	value,
	disabled,
	onChange,
}: {
	value: AppSettings['scrapeCustomHttpProvider']
	disabled: boolean
	onChange: (next: AppSettings['scrapeCustomHttpProvider']) => void
}) {
	const config = value ?? DEFAULT_CUSTOM
	const enabled = config.enabled

	const update = <TKey extends keyof CustomHttpConfig>(key: TKey, next: CustomHttpConfig[TKey]) => {
		onChange({ ...config, [key]: next })
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="scrapeCustomHttpEnabled" className="text-base">
						Custom HTTP scraper
					</Label>
					<p className="text-sm text-muted-foreground">
						Point the orchestrator at your own scraper service. We GET <code className="font-mono">{'{endpoint}?url=<encoded>'}</code> and
						read the response per the response kind.
					</p>
				</div>
				<Switch
					id="scrapeCustomHttpEnabled"
					checked={enabled}
					disabled={disabled}
					onCheckedChange={(checked: boolean) => update('enabled', checked)}
				/>
			</div>

			{enabled && (
				<div className="space-y-4 pl-1">
					<TextRow
						id="scrapeCustomHttpEndpoint"
						label="Endpoint"
						placeholder="https://my-scraper.local/scrape"
						value={config.endpoint}
						disabled={disabled}
						onCommit={next => update('endpoint', next)}
					/>

					<div className="space-y-1">
						<Label htmlFor="scrapeCustomHttpResponseKind" className="text-base">
							Response kind
						</Label>
						<Select
							value={config.responseKind}
							disabled={disabled}
							onValueChange={(v: string) => update('responseKind', v as 'html' | 'json')}
						>
							<SelectTrigger id="scrapeCustomHttpResponseKind" className="w-[200px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="html">HTML (extract locally)</SelectItem>
								<SelectItem value="json">JSON (ScrapeResult shape)</SelectItem>
							</SelectContent>
						</Select>
						<ResponseKindHelp kind={config.responseKind} />
					</div>

					<HeadersRow value={config.customHeaders ?? ''} disabled={disabled} onCommit={v => update('customHeaders', v || undefined)} />
				</div>
			)}
		</div>
	)
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
	disabled,
	onCommit,
}: {
	id: string
	label: string
	hint: string
	suffix?: string
	value: number
	min?: number
	disabled: boolean
	onCommit: (value: number) => void
}) {
	const [draft, setDraft] = useState(String(value))

	useEffect(() => {
		setDraft(String(value))
	}, [value])

	const commit = () => {
		const parsed = Number.parseInt(draft, 10)
		if (!Number.isFinite(parsed)) {
			setDraft(String(value))
			return
		}
		const lower = typeof min === 'number' ? min : 1
		const clamped = Math.max(lower, parsed)
		if (clamped !== value) onCommit(clamped)
		setDraft(String(clamped))
	}

	return (
		<div className="flex items-center justify-between gap-4">
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
					min={min}
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

function HeadersRow({ value, disabled, onCommit }: { value: string; disabled: boolean; onCommit: (value: string) => void }) {
	const [draft, setDraft] = useState(value)

	useEffect(() => {
		setDraft(value)
	}, [value])

	const commit = () => {
		if (draft !== value) onCommit(draft)
	}

	return (
		<div className="space-y-1">
			<Label htmlFor="scrapeCustomHttpHeaders" className="text-base">
				Custom HTTP headers
			</Label>
			<p className="text-xs text-muted-foreground">
				Sent on every request to this scraper. One <code className="font-mono">Header-Name: value</code> per line. Blank lines and{' '}
				<code className="font-mono">#</code>-prefixed comments are ignored.
			</p>
			<Textarea
				id="scrapeCustomHttpHeaders"
				rows={5}
				placeholder={'X-Scrape-Token: abc123\nAuthorization: Bearer xyz'}
				value={draft}
				disabled={disabled}
				className="font-mono text-xs"
				onChange={e => setDraft(e.target.value)}
				onBlur={commit}
			/>
		</div>
	)
}

function TextRow({
	id,
	label,
	value,
	placeholder,
	type,
	disabled,
	onCommit,
}: {
	id: string
	label: string
	value: string
	placeholder?: string
	type?: 'text' | 'password' | 'url'
	disabled: boolean
	onCommit: (value: string) => void
}) {
	const [draft, setDraft] = useState(value)

	useEffect(() => {
		setDraft(value)
	}, [value])

	const commit = () => {
		if (draft !== value) onCommit(draft)
	}

	return (
		<div className="space-y-1">
			<Label htmlFor={id} className="text-base">
				{label}
			</Label>
			<Input
				id={id}
				type={type ?? 'text'}
				value={draft}
				placeholder={placeholder}
				disabled={disabled}
				onChange={e => setDraft(e.target.value)}
				onBlur={commit}
				onKeyDown={e => {
					if (e.key === 'Enter') {
						e.preventDefault()
						commit()
					}
				}}
			/>
		</div>
	)
}
