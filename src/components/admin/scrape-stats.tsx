import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Copy, ListOrdered } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import {
	getScrapeStatsAsAdmin,
	SCRAPE_WINDOW_HOURS,
	type ScrapeFailureRow,
	type ScrapeProviderStat,
	type ScrapeStats as ScrapeStatsPayload,
	type ScrapeWindowHours,
} from '@/api/admin-scrapes'
import { SegmentedToggle } from '@/components/common/segmented-toggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAdminAppSettings } from '@/hooks/use-app-settings'
import type { ScrapeProviderEntry } from '@/lib/settings'
import { cn } from '@/lib/utils'

// Aggregations for the admin Scrape Health card. Per-provider stats come
// straight from a SQL GROUP BY (cheap; one row per provider). Domain and
// errorCode rollups are computed in TS from a capped failure feed so we get
// real URL parsing instead of regex-in-SQL approximations.

const WINDOW_OPTIONS = [
	{ value: '24', label: '24h' },
	{ value: '168', label: '7d' },
	{ value: '720', label: '30d' },
] as const

const TOP_N = 15
const URL_SAMPLES_PER_DOMAIN = 50

// The built-in fetch provider is always-on and not configurable in the admin
// list. It writes rows with this literal `scraperId`; treat it as implicit
// tier 0 so the provider table can group it alongside configured entries.
const FETCH_PROVIDER_ID = 'fetch-provider'
const FETCH_PROVIDER_TIER = 0

function asWindowHours(value: string): ScrapeWindowHours {
	const n = Number(value)
	return SCRAPE_WINDOW_HOURS.find(w => w === n) ?? 168
}

export function ScrapeStats() {
	const [windowHours, setWindowHours] = useState<ScrapeWindowHours>(168)
	const statsQuery = useQuery({
		queryKey: ['admin', 'scrape-stats', windowHours],
		queryFn: () => getScrapeStatsAsAdmin({ data: { windowHours } }),
	})
	const settingsQuery = useAdminAppSettings()

	return (
		<ScrapeStatsView
			windowHours={windowHours}
			onWindowChange={setWindowHours}
			isLoading={statsQuery.isLoading}
			stats={statsQuery.data ?? null}
			scrapeProviders={settingsQuery.data?.scrapeProviders ?? []}
		/>
	)
}

export type ScrapeStatsViewProps = {
	windowHours: ScrapeWindowHours
	onWindowChange: (next: ScrapeWindowHours) => void
	isLoading: boolean
	stats: ScrapeStatsPayload | null
	scrapeProviders: ReadonlyArray<ScrapeProviderEntry>
}

export function ScrapeStatsView({ windowHours, onWindowChange, isLoading, stats, scrapeProviders }: ScrapeStatsViewProps) {
	const { labelFor, currentScraperIds, tierFor } = useMemo(() => buildScraperLookups(scrapeProviders), [scrapeProviders])

	const currentProviders = useMemo(
		() => (stats ? stats.providers.filter(r => isCurrentScraperId(r.scraperId, currentScraperIds)) : []),
		[stats, currentScraperIds]
	)
	const currentFailures = useMemo(
		() => (stats ? stats.failures.filter(f => isCurrentScraperId(f.scraperId, currentScraperIds)) : []),
		[stats, currentScraperIds]
	)
	const currentTotals = useMemo(
		() =>
			currentProviders.reduce(
				(acc, r) => {
					acc.total += r.total
					acc.fail += r.failCount
					return acc
				},
				{ total: 0, fail: 0 }
			),
		[currentProviders]
	)
	const aggregates = useMemo(() => computeFailureAggregates(currentFailures), [currentFailures])

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<SegmentedToggle<string>
					value={String(windowHours)}
					onValueChange={v => onWindowChange(asWindowHours(v))}
					options={WINDOW_OPTIONS}
				/>
				{stats && (
					<div className="text-xs text-muted-foreground tabular-nums">
						{currentTotals.total.toLocaleString()} attempts · {currentTotals.fail.toLocaleString()} failed
						{currentTotals.total > 0 && (
							<span className="ml-1">({((currentTotals.fail / currentTotals.total) * 100).toFixed(1)}% fail rate)</span>
						)}
						{stats.failuresTruncated && (
							<span className="ml-2 inline-flex items-center gap-1 text-amber-600">
								<AlertTriangle className="size-3" />
								failure feed truncated at {stats.failures.length.toLocaleString()}
							</span>
						)}
					</div>
				)}
			</div>

			{isLoading && <div className="text-sm text-muted-foreground">Loading stats…</div>}

			{stats && currentTotals.total === 0 && (
				<div className="text-sm text-muted-foreground italic">No scrape attempts from currently-configured providers in this window.</div>
			)}

			{stats && currentTotals.total > 0 && (
				<>
					<ProviderTable rows={currentProviders} labelFor={labelFor} tierFor={tierFor} />
					<div className="grid gap-4 @lg/admin-content:grid-cols-2">
						<DomainTable rows={aggregates.domains} totalFailures={currentTotals.fail} />
						<ErrorCodeTable rows={aggregates.errorCodes} totalFailures={currentTotals.fail} />
					</div>
				</>
			)}
		</div>
	)
}

function ProviderTable({
	rows,
	labelFor,
	tierFor,
}: {
	rows: Array<ScrapeProviderStat>
	labelFor: (id: string) => string
	tierFor: (id: string) => number | null
}) {
	if (rows.length === 0) return null
	const sorted = [...rows].sort((a, b) => {
		const ta = tierFor(a.scraperId) ?? Number.MAX_SAFE_INTEGER
		const tb = tierFor(b.scraperId) ?? Number.MAX_SAFE_INTEGER
		if (ta !== tb) return ta - tb
		return b.total - a.total
	})
	return (
		<section className="space-y-1.5">
			<div className="overflow-x-auto rounded-md border">
				<Table>
					<TableHeader className="bg-muted/50">
						<TableRow>
							<TableHead>Tier</TableHead>
							<TableHead>Provider</TableHead>
							<TableHead className="text-right">Total</TableHead>
							<TableHead className="text-right">Failed</TableHead>
							<TableHead className="text-right">Fail rate</TableHead>
							<TableHead className="text-right">Avg ms</TableHead>
							<TableHead className="text-right">p95 ms</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{sorted.map(r => {
							const failRate = r.total === 0 ? 0 : (r.failCount / r.total) * 100
							const tier = tierFor(r.scraperId)
							return (
								<TableRow key={r.scraperId}>
									<TableCell className="tabular-nums text-muted-foreground">{formatTier(tier)}</TableCell>
									<TableCell className="font-mono text-xs">{labelFor(r.scraperId)}</TableCell>
									<TableCell className="text-right tabular-nums">{r.total.toLocaleString()}</TableCell>
									<TableCell className="text-right tabular-nums">{r.failCount.toLocaleString()}</TableCell>
									<TableCell className={cn('text-right tabular-nums', failRateClass(failRate))}>{failRate.toFixed(1)}%</TableCell>
									<TableCell className="text-right tabular-nums text-muted-foreground">
										{r.avgMs == null ? '—' : formatMs(r.avgMs)}
									</TableCell>
									<TableCell className="text-right tabular-nums text-muted-foreground">
										{r.p95Ms == null ? '—' : formatMs(r.p95Ms)}
									</TableCell>
								</TableRow>
							)
						})}
					</TableBody>
				</Table>
			</div>
		</section>
	)
}

export type DomainAggregateRow = {
	domain: string
	count: number
	topErrorCode: string | null
	topErrorCount: number
	urls: Array<string>
}

function DomainTable({ rows, totalFailures }: { rows: Array<DomainAggregateRow>; totalFailures: number }) {
	const [openDomain, setOpenDomain] = useState<DomainAggregateRow | null>(null)
	return (
		<section className="space-y-1.5">
			<SectionHeading>Top failing domains</SectionHeading>
			{rows.length === 0 ? (
				<div className="text-sm text-muted-foreground italic">No failures in this window.</div>
			) : (
				<div className="overflow-x-auto rounded-md border">
					<Table>
						<TableHeader className="bg-muted/50">
							<TableRow>
								<TableHead>Domain</TableHead>
								<TableHead className="text-right">Failures</TableHead>
								<TableHead>Top error</TableHead>
								<TableHead className="w-8" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map(r => (
								<TableRow key={r.domain}>
									<TableCell className="font-mono text-xs">{r.domain}</TableCell>
									<TableCell className="text-right tabular-nums">
										{r.count.toLocaleString()}
										{totalFailures > 0 && (
											<span className="ml-1 text-xs text-muted-foreground">({((r.count / totalFailures) * 100).toFixed(0)}%)</span>
										)}
									</TableCell>
									<TableCell className="text-xs">
										{r.topErrorCode ? (
											<>
												<Badge variant="outline" className="font-mono">
													{r.topErrorCode}
												</Badge>
												<span className="ml-1 text-muted-foreground tabular-nums">×{r.topErrorCount}</span>
											</>
										) : (
											<span className="text-muted-foreground italic">unknown</span>
										)}
									</TableCell>
									<TableCell className="text-right">
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="size-7"
											aria-label={`Show example failing URLs for ${r.domain}`}
											onClick={() => setOpenDomain(r)}
										>
											<ListOrdered className="size-4" />
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
			<DomainUrlsDialog row={openDomain} onClose={() => setOpenDomain(null)} />
		</section>
	)
}

function DomainUrlsDialog({ row, onClose }: { row: DomainAggregateRow | null; onClose: () => void }) {
	return (
		<Dialog open={row !== null} onOpenChange={open => !open && onClose()}>
			<DialogContent className="sm:max-w-[640px] max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="font-mono text-base">{row?.domain ?? ''}</DialogTitle>
					<DialogDescription>
						{row
							? `${row.urls.length.toLocaleString()} unique URL${row.urls.length === 1 ? '' : 's'} from ${row.count.toLocaleString()} failure${
									row.count === 1 ? '' : 's'
								} in this window. Click a URL to copy.`
							: ''}
					</DialogDescription>
				</DialogHeader>
				{row && row.urls.length > 0 ? (
					<ul className="space-y-1">
						{row.urls.map(url => (
							<li key={url}>
								<button
									type="button"
									onClick={() => copyUrl(url)}
									className="group flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1 text-left text-xs hover:border-border hover:bg-muted/50"
								>
									<Copy className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
									<span className="font-mono break-all">{url}</span>
								</button>
							</li>
						))}
					</ul>
				) : (
					<div className="text-sm text-muted-foreground italic">No URL examples recorded.</div>
				)}
			</DialogContent>
		</Dialog>
	)
}

function copyUrl(url: string) {
	void navigator.clipboard
		.writeText(url)
		.then(() => toast.success('URL copied'))
		.catch(() => toast.error('Copy failed'))
}

function ErrorCodeTable({ rows, totalFailures }: { rows: Array<{ code: string; count: number }>; totalFailures: number }) {
	return (
		<section className="space-y-1.5">
			<SectionHeading>Top error codes</SectionHeading>
			{rows.length === 0 ? (
				<div className="text-sm text-muted-foreground italic">No failures in this window.</div>
			) : (
				<div className="overflow-x-auto rounded-md border">
					<Table>
						<TableHeader className="bg-muted/50">
							<TableRow>
								<TableHead>Code</TableHead>
								<TableHead className="text-right">Count</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map(r => (
								<TableRow key={r.code}>
									<TableCell className="font-mono text-xs">{r.code}</TableCell>
									<TableCell className="text-right tabular-nums">
										{r.count.toLocaleString()}
										{totalFailures > 0 && (
											<span className="ml-1 text-xs text-muted-foreground">({((r.count / totalFailures) * 100).toFixed(0)}%)</span>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</section>
	)
}

function SectionHeading({ children }: { children: React.ReactNode }) {
	return <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</h4>
}

function failRateClass(rate: number): string {
	if (rate >= 25) return 'text-destructive font-medium'
	if (rate >= 10) return 'text-amber-600 dark:text-amber-500'
	return ''
}

function formatMs(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}`
	return `${(ms / 1000).toFixed(1)}s`
}

function formatTier(tier: number | null): string {
	if (tier === null) return '—'
	if (tier === 0) return '0 (built-in)'
	return String(tier)
}

// Build lookups off the current `scrapeProviders` setting. The built-in
// `fetch-provider` is implicit tier 0; everything else is `${type}:${id}`
// keyed against the entries the admin currently has configured.
export function buildScraperLookups(scrapeProviders: ReadonlyArray<ScrapeProviderEntry>) {
	const namesById = new Map<string, string>()
	const tiersById = new Map<string, number>()
	for (const entry of scrapeProviders) {
		const key = `${entry.type}:${entry.id}`
		namesById.set(key, entry.name)
		tiersById.set(key, entry.tier)
	}
	tiersById.set(FETCH_PROVIDER_ID, FETCH_PROVIDER_TIER)

	const currentScraperIds = new Set<string>([FETCH_PROVIDER_ID, ...namesById.keys()])

	const labelFor = (rawId: string): string => {
		if (rawId.startsWith('merged:')) {
			const ids = rawId.slice('merged:'.length).split(',').filter(Boolean)
			return `${ids.map(id => namesById.get(id) ?? id).join(' + ')} (merged)`
		}
		if (rawId === FETCH_PROVIDER_ID) return 'Built-in'
		return namesById.get(rawId) ?? rawId
	}

	const tierFor = (rawId: string): number | null => {
		if (rawId.startsWith('merged:')) {
			const ids = rawId.slice('merged:'.length).split(',').filter(Boolean)
			// Within-tier merger: every contributor shares a tier. Pick the
			// first known one and fall back to null when none of the
			// contributors are configured anymore.
			for (const id of ids) {
				const t = tiersById.get(id)
				if (t !== undefined) return t
			}
			return null
		}
		const t = tiersById.get(rawId)
		return t === undefined ? null : t
	}

	return { labelFor, tierFor, currentScraperIds }
}

function isCurrentScraperId(rawId: string, currentScraperIds: ReadonlySet<string>): boolean {
	if (rawId.startsWith('merged:')) {
		const ids = rawId.slice('merged:'.length).split(',').filter(Boolean)
		// Keep the row when every contributor still exists. A single dropped
		// part means the merger no longer reflects the current chain.
		return ids.length > 0 && ids.every(id => currentScraperIds.has(id))
	}
	return currentScraperIds.has(rawId)
}

export function computeFailureAggregates(failures: ReadonlyArray<ScrapeFailureRow>) {
	const byDomain = new Map<
		string,
		{ domain: string; count: number; errorCounts: Map<string, number>; urls: Array<string>; urlSet: Set<string> }
	>()
	const byErrorCode = new Map<string, { code: string; count: number }>()

	for (const f of failures) {
		const domain = extractDomain(f.url)
		const cur = byDomain.get(domain) ?? { domain, count: 0, errorCounts: new Map<string, number>(), urls: [], urlSet: new Set<string>() }
		cur.count++
		const code = f.errorCode ?? 'unknown'
		cur.errorCounts.set(code, (cur.errorCounts.get(code) ?? 0) + 1)
		if (!cur.urlSet.has(f.url) && cur.urls.length < URL_SAMPLES_PER_DOMAIN) {
			cur.urlSet.add(f.url)
			cur.urls.push(f.url)
		}
		byDomain.set(domain, cur)

		const ce = byErrorCode.get(code) ?? { code, count: 0 }
		ce.count++
		byErrorCode.set(code, ce)
	}

	const domains: Array<DomainAggregateRow> = Array.from(byDomain.values())
		.map(d => {
			let topCode: string | null = null
			let topN = 0
			for (const [c, n] of d.errorCounts) {
				if (n > topN) {
					topN = n
					topCode = c
				}
			}
			return { domain: d.domain, count: d.count, topErrorCode: topCode, topErrorCount: topN, urls: d.urls }
		})
		.sort((a, b) => b.count - a.count)
		.slice(0, TOP_N)

	const errorCodes = Array.from(byErrorCode.values())
		.sort((a, b) => b.count - a.count)
		.slice(0, TOP_N)

	return { domains, errorCodes }
}

export function extractDomain(rawUrl: string): string {
	try {
		const host = new URL(rawUrl).hostname.toLowerCase()
		return host.startsWith('www.') ? host.slice(4) : host
	} catch {
		return '(unparseable)'
	}
}
