import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useMemo, useState } from 'react'

import {
	getScrapeStatsAsAdmin,
	SCRAPE_WINDOW_HOURS,
	type ScrapeFailureRow,
	type ScrapeProviderStat,
	type ScrapeWindowHours,
} from '@/api/admin-scrapes'
import { SegmentedToggle } from '@/components/common/segmented-toggle'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAdminAppSettings } from '@/hooks/use-app-settings'
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

	const labelForScraperId = useMemo(() => {
		const customNamesById = new Map<string, string>()
		for (const entry of settingsQuery.data?.scrapeProviders ?? []) {
			customNamesById.set(`${entry.type}:${entry.id}`, entry.name)
		}
		return (rawId: string): string => {
			if (rawId.startsWith('merged:')) {
				const ids = rawId.slice('merged:'.length).split(',').filter(Boolean)
				return `${ids.map(id => customNamesById.get(id) ?? id).join(' + ')} (merged)`
			}
			return customNamesById.get(rawId) ?? rawId
		}
	}, [settingsQuery.data])

	const stats = statsQuery.data
	const aggregates = useMemo(() => (stats ? computeFailureAggregates(stats.failures) : null), [stats])

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<SegmentedToggle<string>
					value={String(windowHours)}
					onValueChange={v => setWindowHours(asWindowHours(v))}
					options={WINDOW_OPTIONS}
				/>
				{stats && (
					<div className="text-xs text-muted-foreground tabular-nums">
						{stats.totals.total.toLocaleString()} attempts · {stats.totals.fail.toLocaleString()} failed
						{stats.totals.total > 0 && (
							<span className="ml-1">({((stats.totals.fail / stats.totals.total) * 100).toFixed(1)}% fail rate)</span>
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

			{statsQuery.isLoading && <div className="text-sm text-muted-foreground">Loading stats…</div>}

			{stats && stats.totals.total === 0 && <div className="text-sm text-muted-foreground italic">No scrape attempts in this window.</div>}

			{stats && stats.totals.total > 0 && (
				<>
					<ProviderTable rows={stats.providers} labelFor={labelForScraperId} />
					{aggregates && (
						<div className="grid gap-4 @lg/admin-content:grid-cols-2">
							<DomainTable rows={aggregates.domains} totalFailures={stats.totals.fail} />
							<ErrorCodeTable rows={aggregates.errorCodes} totalFailures={stats.totals.fail} />
						</div>
					)}
				</>
			)}
		</div>
	)
}

function ProviderTable({ rows, labelFor }: { rows: Array<ScrapeProviderStat>; labelFor: (id: string) => string }) {
	if (rows.length === 0) return null
	return (
		<section className="space-y-1.5">
			<SectionHeading>By provider</SectionHeading>
			<div className="overflow-x-auto rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Provider</TableHead>
							<TableHead className="text-right">Total</TableHead>
							<TableHead className="text-right">Failed</TableHead>
							<TableHead className="text-right">Fail rate</TableHead>
							<TableHead className="text-right">Avg ms</TableHead>
							<TableHead className="text-right">p95 ms</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map(r => {
							const failRate = r.total === 0 ? 0 : (r.failCount / r.total) * 100
							return (
								<TableRow key={r.scraperId}>
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

function DomainTable({
	rows,
	totalFailures,
}: {
	rows: Array<{ domain: string; count: number; topErrorCode: string | null; topErrorCount: number }>
	totalFailures: number
}) {
	return (
		<section className="space-y-1.5">
			<SectionHeading>Top failing domains</SectionHeading>
			{rows.length === 0 ? (
				<div className="text-sm text-muted-foreground italic">No failures in this window.</div>
			) : (
				<div className="overflow-x-auto rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Domain</TableHead>
								<TableHead className="text-right">Failures</TableHead>
								<TableHead>Top error</TableHead>
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
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</section>
	)
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
						<TableHeader>
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

export function computeFailureAggregates(failures: Array<ScrapeFailureRow>) {
	const byDomain = new Map<string, { domain: string; count: number; errorCounts: Map<string, number> }>()
	const byErrorCode = new Map<string, { code: string; count: number }>()

	for (const f of failures) {
		const domain = extractDomain(f.url)
		const cur = byDomain.get(domain) ?? { domain, count: 0, errorCounts: new Map() }
		cur.count++
		const code = f.errorCode ?? 'unknown'
		cur.errorCounts.set(code, (cur.errorCounts.get(code) ?? 0) + 1)
		byDomain.set(domain, cur)

		const ce = byErrorCode.get(code) ?? { code, count: 0 }
		ce.count++
		byErrorCode.set(code, ce)
	}

	const domains = Array.from(byDomain.values())
		.map(d => {
			let topCode: string | null = null
			let topN = 0
			for (const [c, n] of d.errorCounts) {
				if (n > topN) {
					topN = n
					topCode = c
				}
			}
			return { domain: d.domain, count: d.count, topErrorCode: topCode, topErrorCount: topN }
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
