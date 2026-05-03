import { format, formatDistanceToNow } from 'date-fns'
import { AlertTriangle, ArrowUpRight, ChevronRight, Hash, Lock, Mail, PlayCircle, Sparkles, TimerReset } from 'lucide-react'
import { useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

const AI_SETTINGS_HREF = '/admin/ai'

import type { AdminIntelligenceData, AdminRunRow, AnalyzerId, DailySeriesPoint } from './__fixtures__/types'

type Props = {
	data: AdminIntelligenceData
	onSettingsChange?: (next: AdminIntelligenceData['settings']) => void
	onRunForUser?: (userId: string) => void
	onRunForMe?: () => void
	onInvalidateHash?: (userId: string) => void
	onPurgeRecs?: (userId: string) => void
	onOpenRun?: (runId: string) => void
}

const ANALYZER_ORDER: Array<AnalyzerId> = ['primary-list', 'stale-items', 'duplicates', 'grouping']

export function AdminIntelligencePageContent({
	data,
	onSettingsChange,
	onRunForUser,
	onRunForMe,
	onInvalidateHash,
	onPurgeRecs,
	onOpenRun,
}: Props) {
	const [filter, setFilter] = useState<'all' | 'success' | 'skipped' | 'error'>('all')
	const filteredRuns = data.runs.filter(r => filter === 'all' || r.status === filter)

	function patch(partial: Partial<AdminIntelligenceData['settings']>) {
		onSettingsChange?.({ ...data.settings, ...partial })
	}

	const providerSummary =
		data.health.provider.source === 'none'
			? 'No provider configured'
			: `${data.health.provider.provider ?? '?'} / ${data.health.provider.model ?? '?'} (${data.health.provider.source})`

	const providerMissing = data.health.provider.source === 'none'
	const enabled = data.settings.enabled

	return (
		<div
			data-intelligence="admin-page"
			data-admin-enabled={enabled ? 'true' : 'false'}
			data-admin-provider-missing={providerMissing ? 'true' : 'false'}
			className="flex flex-col gap-6 max-w-6xl w-full mx-auto px-4 py-6"
		>
			<header data-intelligence="admin-page-header" className="flex items-start justify-between gap-4">
				<div className="flex items-start gap-3">
					<div
						className={cn(
							'flex size-10 items-center justify-center rounded-xl shadow-sm',
							'bg-gradient-to-br from-amber-500 via-pink-500 to-fuchsia-600',
							'dark:from-amber-700 dark:via-pink-700 dark:to-fuchsia-800',
							'ring-1 ring-fuchsia-400/40 dark:ring-fuchsia-600/40'
						)}
					>
						<Sparkles className="size-5 text-amber-100 drop-shadow-[0_0_4px_rgba(255,255,255,0.6)]" />
					</div>
					<div>
						<h1 className="text-2xl font-semibold tracking-tight">Intelligence</h1>
						<p className="text-sm text-muted-foreground">Configure analyzers, debug runs, and inspect costs.</p>
					</div>
				</div>
				{enabled && !providerMissing && (
					<div className="flex items-center gap-2">
						<Button data-intelligence="admin-run-for-me" size="sm" variant="outline" onClick={onRunForMe}>
							<PlayCircle className="size-4" />
							Run for me now
						</Button>
					</div>
				)}
			</header>

			{providerMissing && <ProviderMissingBanner />}

			<EnableToggleCard enabled={enabled} disabled={providerMissing} onToggle={v => patch({ enabled: v })} />

			{enabled && !providerMissing && (
				<>
					<HealthGrid data={data} providerSummary={providerSummary} />
					<SettingsPanel data={data} patch={patch} />
					<RunsTable
						runs={filteredRuns}
						filter={filter}
						setFilter={setFilter}
						onOpenRun={onOpenRun}
						onRunForUser={onRunForUser}
						onInvalidateHash={onInvalidateHash}
						onPurgeRecs={onPurgeRecs}
					/>
				</>
			)}

			{enabled && providerMissing && (
				<Card data-intelligence="admin-blocked-by-provider">
					<CardContent className="p-6 text-sm text-muted-foreground">
						Settings, analyzers, and run history are hidden until an AI provider is configured. Once a provider is set up, this page will
						populate.
					</CardContent>
				</Card>
			)}
		</div>
	)
}

function ProviderMissingBanner() {
	return (
		<Alert data-intelligence="admin-no-provider-banner" variant="destructive">
			<AlertTriangle className="size-4" />
			<AlertTitle>No AI provider configured</AlertTitle>
			<AlertDescription className="flex flex-col gap-2">
				<span>
					Intelligence needs an AI provider before it can generate recommendations. Configure one (Anthropic, OpenAI, or a custom
					OpenAI-compatible endpoint) on the AI settings page.
				</span>
				<a
					data-intelligence="admin-no-provider-link"
					className="inline-flex items-center gap-1 self-start rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs font-medium hover:bg-destructive/20"
					href={AI_SETTINGS_HREF}
				>
					Open AI settings
					<ArrowUpRight className="size-3.5" />
				</a>
			</AlertDescription>
		</Alert>
	)
}

function EnableToggleCard({ enabled, disabled, onToggle }: { enabled: boolean; disabled: boolean; onToggle: (v: boolean) => void }) {
	return (
		<Card data-intelligence="admin-enable-card">
			<CardContent className="px-4 py-2.5 flex items-center justify-between gap-4">
				<div className="flex flex-col gap-1">
					<div className="flex items-center gap-2">
						<span className="text-lg font-semibold">Intelligence feature</span>
						<Badge variant={enabled ? 'secondary' : 'outline'}>{enabled ? 'on' : 'off'}</Badge>
					</div>
					<p className="text-sm text-muted-foreground">
						{enabled
							? 'Cron is generating recommendations. Users see the Intelligence page; manual refresh is allowed.'
							: 'All recommendation generation is paused. Users do not see the page; manual refresh is blocked. Toggling on enables the rest of this admin surface.'}
						{disabled && ' Configure an AI provider before turning this on.'}
					</p>
				</div>
				<Switch data-intelligence="admin-enable-switch" checked={enabled} disabled={disabled} onCheckedChange={onToggle} />
			</CardContent>
		</Card>
	)
}

function HealthGrid({ data, providerSummary }: { data: AdminIntelligenceData; providerSummary: string }) {
	const { health } = data
	return (
		<section data-intelligence="admin-health-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
			<MetricCard label="Active recs" value={health.totalActiveRecs.toString()} sub={`across ${health.analyzers.length} analyzers`} />
			<MetricCard
				label="Runs (24h)"
				value={`${health.last24h.success} ok`}
				sub={`${sumBucket(health.last24h.skipped)} skipped · ${health.last24h.error} error`}
			/>
			<MetricCard
				label="Tokens / day"
				value={`${formatNumber(health.dailyTokensIn + health.dailyTokensOut)}`}
				sub={`${formatNumber(health.dailyTokensIn)} in · ${formatNumber(health.dailyTokensOut)} out`}
			/>
			<MetricCard label="Est. cost / day" value={`$${health.dailyEstimatedCostUsd.toFixed(2)}`} sub={providerSummary} />

			<div className="md:col-span-2 lg:col-span-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
				<RunsActivityChart data={data.dailySeries} />
				<TokenUsageChart data={data.dailySeries} />
			</div>

			<div className="md:col-span-2 lg:col-span-4">
				<Card>
					<CardContent className="p-4">
						<div className="flex items-center justify-between mb-3">
							<h3 className="text-sm font-semibold">Analyzers</h3>
							<div className="text-xs text-muted-foreground">avg duration · tokens · active recs</div>
						</div>
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
							{health.analyzers.map(a => (
								<div key={a.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
									<div className="flex items-center justify-between">
										<span className="text-sm font-medium">{a.label}</span>
										<Badge variant={a.enabled ? 'secondary' : 'outline'}>{a.enabled ? 'on' : 'off'}</Badge>
									</div>
									<div className="mt-1 text-xs text-muted-foreground">
										{a.avgDurationMs}ms · {formatNumber(a.avgTokensIn)} in / {formatNumber(a.avgTokensOut)} out
									</div>
									<div className="text-xs">{a.activeRecs} active recs</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			</div>

			<div className="md:col-span-2 lg:col-span-4">
				<Card>
					<CardContent className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
						<QueueStat icon={TimerReset} label="Overdue" value={health.queue.overdue} />
						<QueueStat icon={Hash} label="Gated by unread" value={health.queue.gatedByUnreadRecs} />
						<QueueStat icon={Lock} label="Lock held" value={health.queue.lockHeld} />
						<div className="ml-auto text-xs text-muted-foreground">
							7d: {health.last7d.success} ok · {sumBucket(health.last7d.skipped)} skipped · {health.last7d.error} err
						</div>
					</CardContent>
				</Card>
			</div>
		</section>
	)
}

function QueueStat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
	return (
		<div className="flex items-center gap-2">
			<Icon className="size-4 text-muted-foreground" />
			<span className="text-muted-foreground">{label}:</span>
			<span className="font-semibold">{value}</span>
		</div>
	)
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
	return (
		<Card>
			<CardContent className="p-4">
				<div className="text-sm uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
				<div className="mt-1 text-4xl font-bold tabular-nums leading-none">{value}</div>
				<div className="mt-1.5 text-sm text-muted-foreground">{sub}</div>
			</CardContent>
		</Card>
	)
}

function SettingsPanel({ data, patch }: { data: AdminIntelligenceData; patch: (p: Partial<AdminIntelligenceData['settings']>) => void }) {
	const s = data.settings
	return (
		<Card data-intelligence="admin-settings">
			<CardContent className="p-5">
				<h2 className="text-lg font-semibold mb-4">Settings</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
					<ToggleRow label="Dry run (don't persist recs)" checked={s.dryRun} onChange={v => patch({ dryRun: v })} />
					<NumberRow label="Refresh interval (days)" value={s.refreshIntervalDays} onChange={v => patch({ refreshIntervalDays: v })} />
					<NumberRow
						label="Manual refresh cooldown (min)"
						value={s.manualRefreshCooldownMinutes}
						onChange={v => patch({ manualRefreshCooldownMinutes: v })}
					/>
					<NumberRow label="Candidate cap per analyzer" value={s.candidateCap} onChange={v => patch({ candidateCap: v })} />
					<NumberRow label="Cron concurrency" value={s.concurrency} onChange={v => patch({ concurrency: v })} />
					<NumberRow label="Users per cron invocation" value={s.usersPerInvocation} onChange={v => patch({ usersPerInvocation: v })} />
					<NumberRow
						label="Stale rec retention (days)"
						value={s.staleRecRetentionDays}
						onChange={v => patch({ staleRecRetentionDays: v })}
					/>
					<NumberRow
						label="Run-step retention (days)"
						value={s.runStepsRetentionDays}
						onChange={v => patch({ runStepsRetentionDays: v })}
					/>

					<div className="md:col-span-2">
						<Separator />
					</div>

					<div className="md:col-span-2">
						<h3 className="text-sm font-semibold mb-2">Per-analyzer</h3>
						<div className="grid grid-cols-2 md:grid-cols-4 gap-2">
							{ANALYZER_ORDER.map(id => (
								<ToggleRow
									key={id}
									label={id}
									compact
									checked={s.perAnalyzerEnabled[id]}
									onChange={v => patch({ perAnalyzerEnabled: { ...s.perAnalyzerEnabled, [id]: v } })}
								/>
							))}
						</div>
					</div>

					<div className="md:col-span-2">
						<Separator />
					</div>

					<div className="md:col-span-2 flex flex-col gap-3">
						<div className="flex items-center gap-2">
							<Mail className="size-4 text-muted-foreground" />
							<h3 className="text-sm font-semibold">Notifications</h3>
							<Badge variant="outline">scaffold only</Badge>
						</div>
						<Alert>
							<AlertTitle>Delivery not yet implemented</AlertTitle>
							<AlertDescription>
								Toggles below are wired into settings but no email is sent. A future PR will hook up transport.
							</AlertDescription>
						</Alert>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
							<ToggleRow label="Email enabled" checked={s.email.enabled} onChange={v => patch({ email: { ...s.email, enabled: v } })} />
							<ToggleRow
								label="Weekly digest"
								checked={s.email.weeklyDigestEnabled}
								onChange={v => patch({ email: { ...s.email, weeklyDigestEnabled: v } })}
							/>
							<div className="md:col-span-2">
								<Label className="text-xs text-muted-foreground">Test recipient (admin only)</Label>
								<Input
									className="mt-1"
									type="email"
									placeholder="optional"
									value={s.email.testRecipient ?? ''}
									onChange={e => patch({ email: { ...s.email, testRecipient: e.target.value || null } })}
								/>
							</div>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	)
}

function ToggleRow({
	label,
	checked,
	onChange,
	compact,
}: {
	label: string
	checked: boolean
	onChange: (v: boolean) => void
	compact?: boolean
}) {
	return (
		<div className={cn('flex items-center justify-between gap-3', compact && 'rounded-md border border-border px-3 py-1.5')}>
			<Label className={cn('text-sm', compact && 'capitalize')}>{label}</Label>
			<Switch checked={checked} onCheckedChange={onChange} />
		</div>
	)
}

function NumberRow({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label className="text-sm">{label}</Label>
			<Input
				type="number"
				value={value}
				onChange={e => {
					const n = Number(e.target.value)
					if (!Number.isNaN(n)) onChange(n)
				}}
			/>
		</div>
	)
}

function RunsTable({
	runs,
	filter,
	setFilter,
	onOpenRun,
	onRunForUser,
	onInvalidateHash,
	onPurgeRecs,
}: {
	runs: Array<AdminRunRow>
	filter: 'all' | 'success' | 'skipped' | 'error'
	setFilter: (f: 'all' | 'success' | 'skipped' | 'error') => void
	onOpenRun?: (id: string) => void
	onRunForUser?: (userId: string) => void
	onInvalidateHash?: (userId: string) => void
	onPurgeRecs?: (userId: string) => void
}) {
	return (
		<section data-intelligence="admin-runs" className="flex flex-col gap-3">
			<div className="flex items-center justify-between gap-3 flex-wrap">
				<h2 className="text-lg font-semibold">Recent runs</h2>
				<div data-intelligence="admin-runs-filter" className="flex items-center gap-1.5">
					{(['all', 'success', 'skipped', 'error'] as const).map(f => (
						<Button
							key={f}
							data-intelligence="admin-runs-filter-button"
							data-filter-value={f}
							size="sm"
							variant={filter === f ? 'default' : 'outline'}
							onClick={() => setFilter(f)}
						>
							{f}
						</Button>
					))}
				</div>
			</div>
			{runs.length === 0 ? (
				<p data-intelligence="admin-runs-empty" className="text-sm text-muted-foreground py-2">
					No runs match this filter.
				</p>
			) : (
				<div className="rounded-md border border-border overflow-hidden">
					<Table data-intelligence="admin-runs-table">
						<TableHeader>
							<TableRow>
								<TableHead>User</TableHead>
								<TableHead>Trigger</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Started</TableHead>
								<TableHead>Duration</TableHead>
								<TableHead>Recs</TableHead>
								<TableHead>Tokens</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{runs.map(run => (
								<TableRow
									key={run.id}
									data-intelligence="admin-runs-row"
									data-run-id={run.id}
									className="cursor-pointer hover:bg-muted/50 group"
									onClick={() => onOpenRun?.(run.id)}
									title="Click to inspect run details"
								>
									<TableCell className="font-medium">
										<span className="inline-flex items-center gap-1.5">
											<ChevronRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
											{run.userName}
										</span>
									</TableCell>
									<TableCell>
										<Badge variant="outline">{run.trigger}</Badge>
									</TableCell>
									<TableCell>
										<StatusBadge run={run} />
									</TableCell>
									<TableCell className="text-muted-foreground text-xs">{formatDistanceToNow(run.startedAt, { addSuffix: true })}</TableCell>
									<TableCell className="tabular-nums text-xs">{run.durationMs ? `${run.durationMs}ms` : '-'}</TableCell>
									<TableCell className="text-xs">{summarizeRecCounts(run)}</TableCell>
									<TableCell className="text-xs tabular-nums">
										{run.tokensIn ? `${formatNumber(run.tokensIn)} / ${formatNumber(run.tokensOut ?? 0)}` : '-'}
									</TableCell>
									<TableCell className="text-right">
										<div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
											<Button size="sm" variant="ghost" onClick={() => onOpenRun?.(run.id)}>
												Inspect
											</Button>
											<Button size="sm" variant="ghost" onClick={() => onRunForUser?.(run.userId)}>
												Re-run
											</Button>
											<Button size="sm" variant="ghost" onClick={() => onInvalidateHash?.(run.userId)}>
												Invalidate
											</Button>
											<Button size="sm" variant="ghost" onClick={() => onPurgeRecs?.(run.userId)}>
												Purge
											</Button>
										</div>
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

function StatusBadge({ run }: { run: AdminRunRow }) {
	if (run.status === 'success') return <Badge variant="secondary">success</Badge>
	if (run.status === 'error')
		return (
			<span className="inline-flex items-center gap-1.5">
				<Badge variant="destructive">error</Badge>
				{run.error && <span className="text-xs text-destructive truncate max-w-xs">{run.error}</span>}
			</span>
		)
	if (run.status === 'skipped')
		return (
			<span className="inline-flex items-center gap-1.5">
				<Badge variant="outline">skipped</Badge>
				{run.skipReason && <span className="text-xs text-muted-foreground">{run.skipReason}</span>}
			</span>
		)
	return <Badge>running</Badge>
}

function summarizeRecCounts(run: AdminRunRow): string {
	const entries = Object.entries(run.recCounts).filter(([, n]) => n > 0)
	if (entries.length === 0) return '-'
	return entries.map(([id, n]) => `${id.split('-')[0]}:${n}`).join(' · ')
}

function sumBucket(o: Record<string, number>): number {
	return Object.values(o).reduce((s, n) => s + n, 0)
}

function formatNumber(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
	return n.toString()
}

// ─── Charts ──────────────────────────────────────────────────────────────────

const runsChartConfig: ChartConfig = {
	runsSuccess: { label: 'Success', color: 'var(--color-emerald-500, oklch(0.7 0.17 162))' },
	runsSkipped: { label: 'Skipped', color: 'var(--color-muted-foreground, oklch(0.55 0 0))' },
	runsError: { label: 'Error', color: 'var(--color-destructive, oklch(0.6 0.22 22))' },
}

function RunsActivityChart({ data }: { data: Array<DailySeriesPoint> }) {
	const total = data.reduce((s, d) => s + d.runsSuccess + d.runsSkipped + d.runsError, 0)
	return (
		<Card data-intelligence="admin-chart-runs">
			<CardContent className="p-4">
				<div className="flex items-baseline justify-between mb-3">
					<h3 className="text-sm font-semibold">Runs (14 days)</h3>
					<span className="text-xs text-muted-foreground tabular-nums">{total} total</span>
				</div>
				<ChartContainer config={runsChartConfig} className="aspect-auto h-44 w-full">
					<BarChart accessibilityLayer data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
						<CartesianGrid vertical={false} strokeDasharray="3 3" />
						<XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={shortDate} fontSize={10} />
						<YAxis tickLine={false} axisLine={false} fontSize={10} width={28} />
						<ChartTooltip content={<ChartTooltipContent />} />
						<Bar dataKey="runsSuccess" stackId="r" fill="var(--color-runsSuccess)" radius={[0, 0, 0, 0]} />
						<Bar dataKey="runsSkipped" stackId="r" fill="var(--color-runsSkipped)" radius={[0, 0, 0, 0]} />
						<Bar dataKey="runsError" stackId="r" fill="var(--color-runsError)" radius={[3, 3, 0, 0]} />
					</BarChart>
				</ChartContainer>
				<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
					<LegendDot color="var(--color-runsSuccess)" label="Success" />
					<LegendDot color="var(--color-runsSkipped)" label="Skipped" />
					<LegendDot color="var(--color-runsError)" label="Error" />
				</div>
			</CardContent>
		</Card>
	)
}

const tokensChartConfig: ChartConfig = {
	tokensIn: { label: 'In', color: 'var(--color-fuchsia-500, oklch(0.66 0.27 330))' },
	tokensOut: { label: 'Out', color: 'var(--color-amber-500, oklch(0.78 0.17 70))' },
}

function TokenUsageChart({ data }: { data: Array<DailySeriesPoint> }) {
	const totalCost = data.reduce((s, d) => s + d.costUsd, 0)
	return (
		<Card data-intelligence="admin-chart-tokens">
			<CardContent className="p-4">
				<div className="flex items-baseline justify-between mb-3">
					<h3 className="text-sm font-semibold">Tokens & cost (14 days)</h3>
					<span className="text-xs text-muted-foreground tabular-nums">${totalCost.toFixed(2)} total</span>
				</div>
				<ChartContainer config={tokensChartConfig} className="aspect-auto h-44 w-full">
					<AreaChart accessibilityLayer data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
						<defs>
							<linearGradient id="fillIn" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="var(--color-tokensIn)" stopOpacity={0.6} />
								<stop offset="100%" stopColor="var(--color-tokensIn)" stopOpacity={0.05} />
							</linearGradient>
							<linearGradient id="fillOut" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="var(--color-tokensOut)" stopOpacity={0.6} />
								<stop offset="100%" stopColor="var(--color-tokensOut)" stopOpacity={0.05} />
							</linearGradient>
						</defs>
						<CartesianGrid vertical={false} strokeDasharray="3 3" />
						<XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={shortDate} fontSize={10} />
						<YAxis tickLine={false} axisLine={false} fontSize={10} width={36} tickFormatter={n => formatNumber(n as number)} />
						<ChartTooltip content={<ChartTooltipContent />} />
						<Area type="monotone" dataKey="tokensIn" stackId="t" stroke="var(--color-tokensIn)" fill="url(#fillIn)" strokeWidth={2} />
						<Area type="monotone" dataKey="tokensOut" stackId="t" stroke="var(--color-tokensOut)" fill="url(#fillOut)" strokeWidth={2} />
					</AreaChart>
				</ChartContainer>
				<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
					<LegendDot color="var(--color-tokensIn)" label="Input" />
					<LegendDot color="var(--color-tokensOut)" label="Output" />
				</div>
			</CardContent>
		</Card>
	)
}

function LegendDot({ color, label }: { color: string; label: string }) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<span className="size-2.5 rounded-sm" style={{ background: color }} />
			{label}
		</span>
	)
}

function shortDate(iso: string): string {
	const d = new Date(iso)
	return `${d.getMonth() + 1}/${d.getDate()}`
}

// Re-export for stories that want to assert the formatted "Last updated" rendering
export { format }
