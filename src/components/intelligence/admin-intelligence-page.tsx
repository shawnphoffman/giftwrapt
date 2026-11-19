import { format } from 'date-fns'
import {
	AlertTriangle,
	ArrowUpRight,
	Beaker,
	CalendarClock,
	ChevronDown,
	ChevronRight,
	Cpu,
	Database,
	Hash,
	Info,
	Loader2,
	Lock,
	Mail,
	MoreHorizontal,
	PlayCircle,
	Sparkles,
	TimerReset,
	Users as UsersIcon,
} from 'lucide-react'
import * as React from 'react'
import { lazy, Suspense, useEffect, useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { dateFnsLocale, formatCurrency, formatNumber, formatTimeAgo } from '@/lib/i18n/format'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

const AI_SETTINGS_HREF = '/admin/ai'

import { Skeleton } from '@/components/ui/skeleton'

import type { AdminIntelligenceData, AdminRunRow, AnalyzerId } from './__fixtures__/types'

// recharts is ~350 KB. The two chart cards only render when the page
// has actual rec-run telemetry; load the chart island lazily so the
// rest of the admin intelligence shell paints first.
const RunsActivityChart = lazy(() => import('./intelligence-charts').then(mod => ({ default: mod.RunsActivityChart })))
const TokenUsageChart = lazy(() => import('./intelligence-charts').then(mod => ({ default: mod.TokenUsageChart })))
const ChartCardFallback = ({ title }: { title: string }) => (
	<Card>
		<CardHeader>
			<CardTitle className="text-2xl">{title}</CardTitle>
		</CardHeader>
		<CardContent>
			<Skeleton className="h-44 w-full" />
		</CardContent>
	</Card>
)

type Props = {
	data: AdminIntelligenceData
	// Defaults to [] so storybook stories that don't care about the
	// run-for-user table can omit it.
	userSummaries?: ReadonlyArray<AdminUserRunSummaryRow>
	onSettingsChange?: (next: AdminIntelligenceData['settings']) => void
	onRunForUser?: (userId: string) => void
	onInvalidateHash?: (userId: string) => void
	onPurgeRecs?: (userId: string) => void
	onOpenRun?: (runId: string) => void
	// Users whose run is currently in flight (either a local click that
	// hasn't resolved, or a server-side `recommendation_runs` row with
	// `status='running'`). Per-row spinner shows when the user is in the set.
	runningUserIds?: ReadonlySet<string>
}

export const ANALYZER_ORDER: Array<AnalyzerId> = [
	'primary-list',
	'list-hygiene',
	'relation-labels',
	'stale-items',
	'duplicates',
	'grouping',
	'missing-price',
	'missing-image',
	'stale-scrape',
	'clothing-prefs',
]

export function AdminIntelligencePageContent({
	data,
	userSummaries = [],
	onSettingsChange,
	onRunForUser,
	onInvalidateHash,
	onPurgeRecs,
	onOpenRun,
	runningUserIds,
}: Props) {
	const [filter, setFilter] = useState<'all' | 'success' | 'skipped' | 'error'>('all')
	const filteredRuns = data.runs.filter(r => filter === 'all' || r.status === filter)

	function patch(partial: Partial<AdminIntelligenceData['settings']>) {
		onSettingsChange?.({ ...data.settings, ...partial })
	}

	const providerSummary =
		data.health.provider.source === 'none'
			? m.admin_intel_provider_none()
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
							'flex size-10 shrink-0 items-center justify-center rounded-xl shadow-sm',
							'bg-linear-to-br from-amber-500 via-pink-500 to-fuchsia-600',
							'dark:from-amber-700 dark:via-pink-700 dark:to-fuchsia-800',
							'ring-1 ring-fuchsia-400/40 dark:ring-fuchsia-600/40'
						)}
					>
						<Sparkles className="size-5 shrink-0 text-amber-100 drop-shadow-[0_0_4px_rgba(255,255,255,0.6)]" />
					</div>
					<div>
						<h1 className="text-2xl font-semibold tracking-tight">{m.page_intelligence()}</h1>
						<p className="text-sm text-muted-foreground">{m.admin_intel_page_subtitle()}</p>
					</div>
				</div>
			</header>

			{providerMissing && <ProviderMissingBanner />}

			{!enabled && (
				<Alert data-intelligence="admin-intelligence-disabled-banner">
					<AlertTitle>{m.admin_intel_disabled_title()}</AlertTitle>
					<AlertDescription className="flex flex-col gap-2">
						<span>{m.admin_intel_disabled_body()}</span>
						<Button asChild variant="outline" size="xs" className="self-start">
							<a href="/admin/ai">
								{m.admin_intel_disabled_link()}
								<ArrowUpRight className="size-3.5" />
							</a>
						</Button>
					</AlertDescription>
				</Alert>
			)}

			{enabled && !providerMissing && (
				<>
					<HealthGrid data={data} providerSummary={providerSummary} />
					<ActionsCard summaries={userSummaries} onRunForUser={onRunForUser} runningUserIds={runningUserIds} />
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
				<Card data-intelligence="admin-blocked-by-provider" data-card-variant="state">
					<CardContent className="p-6 text-center text-sm text-muted-foreground">{m.admin_intel_blocked_by_provider()}</CardContent>
				</Card>
			)}
		</div>
	)
}

export function ProviderMissingBanner() {
	return (
		<Alert data-intelligence="admin-no-provider-banner" variant="destructive">
			<AlertTriangle className="size-4" />
			<AlertTitle>{m.admin_intel_no_provider_title()}</AlertTitle>
			<AlertDescription className="flex flex-col gap-2">
				<span>{m.admin_intel_no_provider_body()}</span>
				<Button asChild variant="destructive" size="xs" className="self-start">
					<a data-intelligence="admin-no-provider-link" href={AI_SETTINGS_HREF}>
						{m.admin_intel_no_provider_link()}
						<ArrowUpRight className="size-3.5" />
					</a>
				</Button>
			</AlertDescription>
		</Alert>
	)
}

function AnalyzerBadge({ tone, children }: { tone: 'kind-heuristic' | 'kind-ai' | 'trigger' | 'status'; children: React.ReactNode }) {
	if (tone === 'kind-ai') {
		return (
			<span className="inline-flex items-center rounded-md bg-linear-to-br from-amber-500 via-pink-500 to-fuchsia-600 px-1.5 py-0.5 text-3xs font-medium text-white shadow-sm dark:from-amber-700 dark:via-pink-700 dark:to-fuchsia-800">
				{children}
			</span>
		)
	}
	if (tone === 'kind-heuristic') {
		return (
			<Badge variant="secondary" className="text-3xs">
				{children}
			</Badge>
		)
	}
	if (tone === 'status') {
		return (
			<Badge variant="outline" className="text-3xs border-amber-500/40 text-amber-600 dark:text-amber-400">
				{children}
			</Badge>
		)
	}
	return (
		<Badge variant="outline" className="text-3xs">
			{children}
		</Badge>
	)
}

function AnalyzerBadgeList({ kind, triggers, status }: { kind: AnalyzerKind; triggers: Array<AnalyzerTrigger>; status?: AnalyzerStatus }) {
	return (
		<>
			<AnalyzerBadge tone={kind === 'ai' ? 'kind-ai' : 'kind-heuristic'}>
				{kind === 'ai' ? m.admin_intel_badge_ai() : m.admin_intel_badge_heuristic()}
			</AnalyzerBadge>
			{triggers.includes('cron') && <AnalyzerBadge tone="trigger">{m.admin_intel_badge_cron()}</AnalyzerBadge>}
			{triggers.includes('manual') && <AnalyzerBadge tone="trigger">{m.admin_intel_badge_manual()}</AnalyzerBadge>}
			{status === 'coming-soon' && <AnalyzerBadge tone="status">{m.admin_intel_badge_coming_soon()}</AnalyzerBadge>}
		</>
	)
}

export function AnalyzerBadges({
	kind,
	triggers,
	status,
}: {
	kind: AnalyzerKind
	triggers: Array<AnalyzerTrigger>
	status?: AnalyzerStatus
}) {
	return (
		<>
			<div className="hidden sm:flex items-center gap-1.5 flex-wrap">
				<AnalyzerBadgeList kind={kind} triggers={triggers} status={status} />
			</div>
			<div className="sm:hidden">
				<Popover>
					<PopoverTrigger asChild>
						<Button
							size="icon-xs"
							variant="outline"
							className="text-muted-foreground hover:text-foreground"
							aria-label={m.admin_intel_analyzer_details_label()}
						>
							<Info className="size-4" />
						</Button>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-auto p-2 flex flex-wrap gap-1.5">
						<AnalyzerBadgeList kind={kind} triggers={triggers} status={status} />
					</PopoverContent>
				</Popover>
			</div>
		</>
	)
}

export type AdminUserRunSummaryRow = {
	userId: string
	name: string | null
	image: string | null
	email: string
	role: 'user' | 'admin' | 'child'
	isMe: boolean
	lastRunAt: Date | null
	lastRunStatus: 'running' | 'success' | 'error' | 'skipped' | null
	lastRunSkipReason: string | null
	activeRecs: number
	dismissedRecs: number
	appliedRecs: number
}

export function ActionsCard({
	summaries,
	onRunForUser,
	runningUserIds,
}: {
	summaries: ReadonlyArray<AdminUserRunSummaryRow>
	onRunForUser?: (userId: string) => void
	runningUserIds?: ReadonlySet<string>
}) {
	const sorted = React.useMemo(() => sortSummaries(summaries), [summaries])
	return (
		<Card data-intelligence="admin-actions-card">
			<CardHeader>
				<CardTitle className="text-2xl">{m.admin_intel_actions_title()}</CardTitle>
				<CardDescription>{m.admin_intel_actions_description()}</CardDescription>
			</CardHeader>
			<CardContent>
				<Table data-intelligence="admin-actions-user-table">
					<TableHeader>
						<TableRow>
							<TableHead>{m.admin_intel_col_user()}</TableHead>
							<TableHead className="hidden md:table-cell">{m.admin_intel_col_last_run()}</TableHead>
							<TableHead className="text-right">{m.admin_intel_col_recs()}</TableHead>
							<TableHead className="text-right">{m.admin_intel_col_run()}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{sorted.map(row => (
							<UserActionRow key={row.userId} row={row} onRunForUser={onRunForUser} isRunning={runningUserIds?.has(row.userId) ?? false} />
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	)
}

function sortSummaries(rows: ReadonlyArray<AdminUserRunSummaryRow>): Array<AdminUserRunSummaryRow> {
	// Surface "needs attention" first: never-run users at the top, then
	// users with active recs (descending), then by oldest run.
	return [...rows].sort((a, b) => {
		if (a.isMe !== b.isMe) return a.isMe ? -1 : 1
		const aNever = a.lastRunAt == null
		const bNever = b.lastRunAt == null
		if (aNever !== bNever) return aNever ? -1 : 1
		if (a.activeRecs !== b.activeRecs) return b.activeRecs - a.activeRecs
		const aTime = a.lastRunAt?.getTime() ?? 0
		const bTime = b.lastRunAt?.getTime() ?? 0
		return aTime - bTime
	})
}

function UserActionRow({
	row,
	onRunForUser,
	isRunning,
}: {
	row: AdminUserRunSummaryRow
	onRunForUser?: (userId: string) => void
	isRunning: boolean
}) {
	const pending = isRunning
	const initials = (row.name ?? row.email).slice(0, 2).toUpperCase()
	return (
		<TableRow data-intelligence="admin-actions-user-row" data-user-id={row.userId} data-is-me={row.isMe ? 'true' : 'false'}>
			<TableCell>
				<div className="flex items-center gap-2 min-w-0">
					<Avatar className="size-7 shrink-0">
						{row.image && <AvatarImage src={row.image} alt={row.name ?? row.email} />}
						<AvatarFallback className="text-3xs">{initials}</AvatarFallback>
					</Avatar>
					<div className="flex flex-col min-w-0">
						<span className="text-sm font-medium truncate flex items-center gap-1.5">
							{row.name ?? row.email}
							{row.isMe && (
								<Badge variant="secondary" className="text-3xs">
									{m.word_you()}
								</Badge>
							)}
							{row.role !== 'user' && (
								<Badge variant="outline" className="text-3xs">
									{roleLabel(row.role)}
								</Badge>
							)}
						</span>
						<span className="text-2xs text-muted-foreground truncate">{row.email}</span>
					</div>
				</div>
			</TableCell>
			<TableCell className="hidden md:table-cell">
				<LastRunCell row={row} />
			</TableCell>
			<TableCell className="text-right tabular-nums">
				<span className="text-sm font-medium">{row.activeRecs}</span>
				<span className="text-muted-foreground"> / {row.dismissedRecs}</span>
				<span className="text-muted-foreground"> / {row.appliedRecs}</span>
			</TableCell>
			<TableCell className="text-right">
				<Button
					data-intelligence="admin-run-for-user"
					data-user-id={row.userId}
					size="sm"
					variant="outline"
					onClick={() => onRunForUser?.(row.userId)}
					disabled={pending || !onRunForUser}
				>
					{pending ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
					{pending ? m.admin_intel_running_button() : m.admin_intel_run_button()}
				</Button>
			</TableCell>
		</TableRow>
	)
}

const RUN_FILTERS = ['all', 'success', 'skipped', 'error'] as const

function fullDateTime(date: Date): string {
	return format(date, 'PPpp', { locale: dateFnsLocale() })
}

function LastRunCell({ row }: { row: AdminUserRunSummaryRow }) {
	if (!row.lastRunAt) {
		return <span className="text-xs text-muted-foreground italic">{m.admin_intel_never_run()}</span>
	}
	const variant: 'destructive' | 'secondary' | 'outline' = row.lastRunStatus === 'error' ? 'destructive' : 'secondary'
	return (
		<div className="flex flex-col gap-0.5">
			<span className="text-xs text-muted-foreground" title={fullDateTime(row.lastRunAt)}>
				{formatTimeAgo(row.lastRunAt)}
			</span>
			<span className="flex items-center gap-1.5">
				{row.lastRunStatus && (
					<Badge variant={variant} className="text-3xs">
						{runStatusLabel(row.lastRunStatus)}
					</Badge>
				)}
				{row.lastRunSkipReason && <span className="text-3xs text-muted-foreground font-mono">{row.lastRunSkipReason}</span>}
			</span>
		</div>
	)
}

export function HealthGrid({ data, providerSummary }: { data: AdminIntelligenceData; providerSummary: string }) {
	const { health } = data
	return (
		<section data-intelligence="admin-health-grid" className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-3">
			<MetricCard
				icon={Sparkles}
				label={m.admin_intel_metric_active_recs()}
				value={health.totalActiveRecs.toString()}
				sub={m.admin_intel_metric_active_recs_sub({ count: health.analyzers.length })}
				gradient="from-fuchsia-400/40 via-pink-400/30 to-rose-500/40"
			/>
			<MetricCard
				icon={PlayCircle}
				label={m.admin_intel_metric_runs_24h()}
				value={m.admin_intel_metric_runs_value({ count: health.last24h.success })}
				sub={m.admin_intel_metric_runs_sub({ skipped: sumBucket(health.last24h.skipped), errors: health.last24h.error })}
				gradient="from-emerald-400/40 via-teal-400/30 to-cyan-500/40"
			/>
			<MetricCard
				icon={Hash}
				label={m.admin_intel_metric_tokens_day()}
				value={compactNumber(health.dailyTokensIn + health.dailyTokensOut)}
				sub={m.admin_intel_metric_tokens_sub({
					tokensIn: compactNumber(health.dailyTokensIn),
					tokensOut: compactNumber(health.dailyTokensOut),
				})}
				gradient="from-amber-400/40 via-orange-400/30 to-pink-500/40"
			/>
			<MetricCard
				icon={Cpu}
				label={m.admin_intel_metric_cost_day()}
				value={`~${formatCurrency(health.dailyEstimatedCostUsd, 'USD')}`}
				sub={providerSummary}
				gradient="from-violet-400/40 via-purple-400/30 to-fuchsia-500/40"
			/>

			<div className="lg:col-span-2 xl:col-span-4 grid grid-cols-1 xl:grid-cols-2 gap-3">
				<Suspense fallback={<ChartCardFallback title={m.admin_intel_chart_runs_loading_title()} />}>
					<RunsActivityChart data={data.dailySeries} />
				</Suspense>
				<Suspense fallback={<ChartCardFallback title={m.admin_intel_chart_tokens_loading_title()} />}>
					<TokenUsageChart data={data.dailySeries} />
				</Suspense>
			</div>

			<div className="lg:col-span-2 xl:col-span-4">
				<Card>
					<CardHeader>
						<CardTitle className="text-2xl">{m.admin_intel_analyzers_title()}</CardTitle>
						<CardDescription>{m.admin_intel_analyzers_card_description()}</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-4 gap-3">
							{health.analyzers.map(a => (
								<div key={a.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
									<div className="flex items-center justify-between">
										<span className="text-sm font-medium">{a.label}</span>
										<Badge variant={a.enabled ? 'secondary' : 'outline'}>
											{a.enabled ? m.admin_intel_state_on() : m.admin_intel_state_off()}
										</Badge>
									</div>
									<div className="mt-1 text-xs text-muted-foreground">
										{m.admin_intel_analyzer_stats({
											duration: a.avgDurationMs,
											tokensIn: compactNumber(a.avgTokensIn),
											tokensOut: compactNumber(a.avgTokensOut),
										})}
									</div>
									<div className="text-xs">{m.admin_intel_analyzer_active_recs({ count: a.activeRecs })}</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			</div>

			<div className="lg:col-span-2 xl:col-span-4">
				<Card>
					<CardHeader>
						<CardTitle className="text-2xl">{m.admin_intel_queue_title()}</CardTitle>
						<CardDescription>
							{m.admin_intel_queue_summary({
								success: health.last7d.success,
								skipped: sumBucket(health.last7d.skipped),
								errors: health.last7d.error,
							})}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
							<QueueStat icon={TimerReset} label={m.admin_intel_queue_overdue()} value={health.queue.overdue} />
							<QueueStat icon={Lock} label={m.admin_intel_queue_lock_held()} value={health.queue.lockHeld} />
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
			<span className="text-muted-foreground">{label}</span>
			<span className="font-semibold">{value}</span>
		</div>
	)
}

function MetricCard({
	icon: Icon,
	label,
	value,
	sub,
	gradient,
}: {
	icon: React.ComponentType<{ className?: string }>
	label: string
	value: string
	sub: string
	gradient: string
}) {
	return (
		<Card className={cn('bg-linear-to-br', gradient)}>
			<CardHeader>
				<CardTitle className="text-2xl flex items-center gap-2">
					<Icon className="size-5" />
					{label}
				</CardTitle>
				<CardDescription className="text-foreground/50">{sub}</CardDescription>
			</CardHeader>
			<CardContent>
				<span className="text-4xl font-bold tabular-nums">{value}</span>
			</CardContent>
		</Card>
	)
}

// Per-analyzer descriptions for the Analyzers section. Hardcoded here so
// admins see what each toggle actually does without having to dig into
// the analyzer source. Keep these short; long copy belongs in docs.
export type AnalyzerKind = 'heuristic' | 'ai'
export type AnalyzerTrigger = 'cron' | 'manual'
export type AnalyzerStatus = 'coming-soon'

export const ANALYZER_META: Record<
	AnalyzerId,
	{
		label: () => string
		description: () => string
		example: () => string
		kind: AnalyzerKind
		triggers: Array<AnalyzerTrigger>
		status?: AnalyzerStatus
	}
> = {
	'primary-list': {
		label: () => m.admin_intel_analyzer_primary_list_label(),
		description: () => m.admin_intel_analyzer_primary_list_description(),
		example: () => m.admin_intel_analyzer_primary_list_example(),
		kind: 'heuristic',
		triggers: ['cron', 'manual'],
	},
	'list-hygiene': {
		label: () => m.admin_intel_analyzer_list_hygiene_label(),
		description: () => m.admin_intel_analyzer_list_hygiene_description(),
		example: () => m.admin_intel_analyzer_list_hygiene_example(),
		kind: 'heuristic',
		triggers: ['cron', 'manual'],
	},
	'relation-labels': {
		label: () => m.admin_intel_analyzer_relation_labels_label(),
		description: () => m.admin_intel_analyzer_relation_labels_description(),
		example: () => m.admin_intel_analyzer_relation_labels_example(),
		kind: 'heuristic',
		triggers: ['cron', 'manual'],
	},
	'stale-items': {
		label: () => m.admin_intel_analyzer_stale_items_label(),
		description: () => m.admin_intel_analyzer_stale_items_description(),
		example: () => m.admin_intel_analyzer_stale_items_example(),
		kind: 'ai',
		triggers: ['cron', 'manual'],
	},
	duplicates: {
		label: () => m.admin_intel_analyzer_duplicates_label(),
		description: () => m.admin_intel_analyzer_duplicates_description(),
		example: () => m.admin_intel_analyzer_duplicates_example(),
		kind: 'ai',
		triggers: ['cron', 'manual'],
	},
	grouping: {
		label: () => m.admin_intel_analyzer_grouping_label(),
		description: () => m.admin_intel_analyzer_grouping_description(),
		example: () => m.admin_intel_analyzer_grouping_example(),
		kind: 'ai',
		triggers: ['cron', 'manual'],
	},
	'missing-price': {
		label: () => m.admin_intel_analyzer_missing_price_label(),
		description: () => m.admin_intel_analyzer_missing_price_description(),
		example: () => m.admin_intel_analyzer_missing_price_example(),
		kind: 'heuristic',
		triggers: ['cron', 'manual'],
	},
	'missing-image': {
		label: () => m.admin_intel_analyzer_missing_image_label(),
		description: () => m.admin_intel_analyzer_missing_image_description(),
		example: () => m.admin_intel_analyzer_missing_image_example(),
		kind: 'heuristic',
		triggers: ['cron', 'manual'],
	},
	'stale-scrape': {
		label: () => m.admin_intel_analyzer_stale_scrape_label(),
		description: () => m.admin_intel_analyzer_stale_scrape_description(),
		example: () => m.admin_intel_analyzer_stale_scrape_example(),
		kind: 'heuristic',
		triggers: ['cron', 'manual'],
	},
	'clothing-prefs': {
		label: () => m.admin_intel_analyzer_clothing_prefs_label(),
		description: () => m.admin_intel_analyzer_clothing_prefs_description(),
		example: () => m.admin_intel_analyzer_clothing_prefs_example(),
		kind: 'ai',
		triggers: ['cron', 'manual'],
	},
}

export function SettingsPanel({
	data,
	patch,
}: {
	data: AdminIntelligenceData
	patch: (p: Partial<AdminIntelligenceData['settings']>) => void
}) {
	const s = data.settings
	const audienceCount = data.health.queue.overdue
	return (
		<Card data-intelligence="admin-settings">
			<CardHeader>
				<CardTitle className="text-2xl">{m.admin_intel_settings_title()}</CardTitle>
				<CardDescription>{m.admin_intel_settings_description()}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3 pb-4">
				<SettingsSection
					id="schedule"
					icon={CalendarClock}
					title={m.admin_intel_schedule_title()}
					summary={m.admin_intel_schedule_summary({ days: s.refreshIntervalDays, minutes: s.manualRefreshCooldownMinutes })}
					defaultOpen
				>
					<p className="text-xs text-muted-foreground">{m.admin_intel_schedule_help()}</p>
					<div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label={m.admin_intel_refresh_interval_label()}
							hint={m.admin_intel_refresh_interval_hint()}
							value={s.refreshIntervalDays}
							onChange={v => patch({ refreshIntervalDays: v })}
						/>
						<NumberRow
							label={m.admin_intel_cooldown_label_short()}
							hint={m.admin_intel_cooldown_hint()}
							value={s.manualRefreshCooldownMinutes}
							onChange={v => patch({ manualRefreshCooldownMinutes: v })}
						/>
					</div>
				</SettingsSection>

				<SettingsSection
					id="analyzers"
					icon={Sparkles}
					title={m.admin_intel_analyzers_title()}
					summary={m.admin_intel_analyzers_summary({
						enabled: ANALYZER_ORDER.filter(id => s.perAnalyzerEnabled[id]).length,
						total: ANALYZER_ORDER.length,
					})}
					defaultOpen
				>
					<p className="text-xs text-muted-foreground">{m.admin_intel_analyzers_help()}</p>
					<div className="flex flex-col gap-2">
						{ANALYZER_ORDER.map(id => {
							const meta = ANALYZER_META[id]
							const enabled = s.perAnalyzerEnabled[id]
							return (
								<div
									key={id}
									data-intelligence="admin-analyzer-row"
									data-analyzer={id}
									data-enabled={enabled ? 'true' : 'false'}
									className="rounded-md border border-border bg-muted/10 p-3 flex items-start justify-between gap-3"
								>
									<div className="flex flex-col gap-1 min-w-0">
										<div className="flex items-center gap-2 flex-wrap">
											<span className="text-sm font-medium">{meta.label()}</span>
											<AnalyzerBadges kind={meta.kind} triggers={meta.triggers} status={meta.status} />
										</div>
										<p className="text-xs text-muted-foreground">{meta.description()}</p>
									</div>
									<Switch
										data-intelligence="admin-analyzer-toggle"
										data-analyzer={id}
										checked={enabled}
										onCheckedChange={v => patch({ perAnalyzerEnabled: { ...s.perAnalyzerEnabled, [id]: v } })}
									/>
								</div>
							)
						})}
					</div>
				</SettingsSection>

				<SettingsSection
					id="audience"
					icon={UsersIcon}
					title={m.admin_intel_audience_title()}
					summary={m.admin_intel_audience_summary({ count: audienceCount })}
				>
					<p className="text-xs text-muted-foreground">{m.admin_intel_audience_help()}</p>
					<div className="rounded-md border border-border bg-muted/10 px-3 py-2 text-xs">
						<div className="text-muted-foreground">{m.admin_intel_audience_eligible()}</div>
						<div className="text-base font-semibold tabular-nums">{audienceCount}</div>
					</div>
				</SettingsSection>

				<SettingsSection
					id="inputs"
					icon={Beaker}
					title={m.admin_intel_inputs_title_short()}
					summary={
						s.dryRun
							? m.admin_intel_inputs_summary_dry({ cap: s.candidateCap })
							: m.admin_intel_inputs_summary_persist({ cap: s.candidateCap })
					}
				>
					<p className="text-xs text-muted-foreground">{m.admin_intel_inputs_help()}</p>
					<div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label={m.admin_intel_candidate_cap_label()}
							hint={m.admin_intel_candidate_cap_hint()}
							value={s.candidateCap}
							onChange={v => patch({ candidateCap: v })}
						/>
						<ToggleRow label={m.admin_intel_dry_run_label_long()} checked={s.dryRun} onChange={v => patch({ dryRun: v })} />
					</div>
				</SettingsSection>

				<SettingsSection
					id="cron-workers"
					icon={Cpu}
					title={m.admin_intel_workers_title_short()}
					summary={m.admin_intel_workers_summary({ concurrency: s.concurrency, users: s.usersPerInvocation })}
				>
					<p className="text-xs text-muted-foreground">{m.admin_intel_workers_help()}</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label={m.admin_intel_concurrency_label()}
							hint={m.admin_intel_concurrency_hint()}
							value={s.concurrency}
							onChange={v => patch({ concurrency: v })}
						/>
						<NumberRow
							label={m.admin_intel_users_per_invocation_label()}
							hint={m.admin_intel_users_per_invocation_hint()}
							value={s.usersPerInvocation}
							onChange={v => patch({ usersPerInvocation: v })}
						/>
					</div>
				</SettingsSection>

				<SettingsSection
					id="retention"
					icon={Database}
					title={m.admin_intel_retention_title()}
					summary={m.admin_intel_retention_summary({ recDays: s.staleRecRetentionDays, stepDays: s.runStepsRetentionDays })}
				>
					<p className="text-xs text-muted-foreground">{m.admin_intel_retention_help()}</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label={m.admin_intel_stale_rec_retention_label()}
							hint={m.admin_intel_stale_rec_retention_hint()}
							value={s.staleRecRetentionDays}
							onChange={v => patch({ staleRecRetentionDays: v })}
						/>
						<NumberRow
							label={m.admin_intel_run_step_retention_label()}
							hint={m.admin_intel_run_step_retention_hint()}
							value={s.runStepsRetentionDays}
							onChange={v => patch({ runStepsRetentionDays: v })}
						/>
					</div>
				</SettingsSection>

				<SettingsSection
					id="notifications"
					icon={Mail}
					title={m.admin_intel_notifications_title()}
					summary={s.email.enabled ? m.admin_intel_notifications_summary_on() : m.admin_intel_notifications_summary_off()}
				>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
						<ToggleRow
							label={m.admin_intel_email_enabled_label()}
							checked={s.email.enabled}
							onChange={v => patch({ email: { ...s.email, enabled: v } })}
						/>
						<ToggleRow
							label={m.admin_intel_weekly_digest_label()}
							checked={s.email.weeklyDigestEnabled}
							onChange={v => patch({ email: { ...s.email, weeklyDigestEnabled: v } })}
						/>
						<div className="md:col-span-2">
							<Label className="text-xs text-muted-foreground">{m.admin_intel_recipient_override_label()}</Label>
							<TextInputOnBlur
								className="mt-1"
								type="email"
								placeholder={m.admin_intel_recipient_override_placeholder()}
								value={s.email.testRecipient ?? ''}
								onCommit={v => patch({ email: { ...s.email, testRecipient: v || null } })}
							/>
						</div>
					</div>
				</SettingsSection>
			</CardContent>
		</Card>
	)
}

export function SettingsSection({
	id,
	icon: Icon,
	title,
	summary,
	badge,
	defaultOpen,
	children,
}: {
	id: string
	icon: React.ComponentType<{ className?: string }>
	title: string
	summary: string
	badge?: string
	defaultOpen?: boolean
	children: React.ReactNode
}) {
	return (
		<Collapsible defaultOpen={defaultOpen} data-intelligence="admin-settings-section" data-section={id}>
			<CollapsibleTrigger
				data-intelligence="admin-settings-section-trigger"
				className="group w-full flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 hover:bg-muted/40 px-3 py-2.5 text-left"
			>
				<div className="flex items-center gap-2.5 min-w-0">
					<Icon className="size-4 text-muted-foreground shrink-0" />
					<div className="flex flex-col min-w-0">
						<div className="flex items-center gap-2 flex-wrap">
							<span className="text-sm font-semibold">{title}</span>
							{badge && (
								<Badge variant="outline" className="text-3xs">
									{badge}
								</Badge>
							)}
						</div>
						<span className="text-2xs text-muted-foreground truncate">{summary}</span>
					</div>
				</div>
				<ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 shrink-0" />
			</CollapsibleTrigger>
			<CollapsibleContent
				data-intelligence="admin-settings-section-content"
				className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 overflow-hidden"
			>
				<div className="px-3 pt-3 pb-1 flex flex-col gap-3">{children}</div>
			</CollapsibleContent>
		</Collapsible>
	)
}

export function ToggleRow({
	label,
	checked,
	onChange,
	compact,
	disabled,
}: {
	label: string
	checked: boolean
	onChange: (v: boolean) => void
	compact?: boolean
	disabled?: boolean
}) {
	return (
		<div className={cn('flex items-center justify-between gap-3', compact && 'rounded-md border border-border px-3 py-1.5')}>
			<Label className={cn('text-sm', compact && 'capitalize')}>{label}</Label>
			<Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
		</div>
	)
}

export function TextInputOnBlur({
	value,
	onCommit,
	className,
	type = 'text',
	placeholder,
	disabled,
}: {
	value: string
	onCommit: (v: string) => void
	className?: string
	type?: string
	placeholder?: string
	disabled?: boolean
}) {
	const [draft, setDraft] = useState(value)
	useEffect(() => {
		setDraft(value)
	}, [value])
	const commit = () => {
		if (draft !== value) onCommit(draft)
	}
	return (
		<Input
			className={className}
			type={type}
			placeholder={placeholder}
			disabled={disabled}
			value={draft}
			onChange={e => setDraft(e.target.value)}
			onBlur={commit}
			onKeyDown={e => {
				if (e.key === 'Enter') {
					e.currentTarget.blur()
				} else if (e.key === 'Escape') {
					setDraft(value)
					e.currentTarget.blur()
				}
			}}
		/>
	)
}

export function NumberRow({
	label,
	value,
	onChange,
	hint,
}: {
	label: string
	value: number
	onChange: (n: number) => void
	hint?: string
}) {
	const [draft, setDraft] = useState(String(value))
	useEffect(() => {
		setDraft(String(value))
	}, [value])
	const commit = () => {
		const n = Number(draft)
		if (!Number.isNaN(n) && n !== value) {
			onChange(n)
		} else {
			setDraft(String(value))
		}
	}
	return (
		<div className="flex flex-col gap-1.5">
			<Label className="text-sm">{label}</Label>
			<Input
				type="number"
				value={draft}
				onChange={e => setDraft(e.target.value)}
				onBlur={commit}
				onKeyDown={e => {
					if (e.key === 'Enter') {
						e.currentTarget.blur()
					} else if (e.key === 'Escape') {
						setDraft(String(value))
						e.currentTarget.blur()
					}
				}}
			/>
			{hint && <p className="text-2xs text-muted-foreground">{hint}</p>}
		</div>
	)
}

export function RunsTable({
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
		<Card data-intelligence="admin-runs">
			<CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap">
				<div className="space-y-1.5">
					<CardTitle className="text-2xl">{m.admin_intel_runs_title()}</CardTitle>
					<CardDescription>{m.admin_intel_runs_description()}</CardDescription>
				</div>
				<div data-intelligence="admin-runs-filter" className="flex items-center gap-1.5">
					{RUN_FILTERS.map(f => (
						<Button
							key={f}
							data-intelligence="admin-runs-filter-button"
							data-filter-value={f}
							size="xs"
							variant={filter === f ? 'default' : 'outline'}
							className="uppercase"
							onClick={() => setFilter(f)}
						>
							{runFilterLabel(f)}
						</Button>
					))}
				</div>
			</CardHeader>
			<CardContent>
				{runs.length === 0 ? (
					<p data-intelligence="admin-runs-empty" className="text-sm text-muted-foreground py-2">
						{m.admin_intel_runs_empty()}
					</p>
				) : (
					<div className="rounded-lg border overflow-x-auto">
						<Table data-intelligence="admin-runs-table">
							<TableHeader>
								<TableRow>
									<TableHead>{m.admin_intel_col_user()}</TableHead>
									<TableHead>{m.admin_intel_col_trigger()}</TableHead>
									<TableHead>{m.admin_intel_col_status()}</TableHead>
									<TableHead>{m.admin_intel_col_started()}</TableHead>
									<TableHead>{m.admin_intel_col_duration()}</TableHead>
									<TableHead>{m.admin_intel_col_recommendations()}</TableHead>
									<TableHead>{m.admin_intel_col_tokens()}</TableHead>
									<TableHead className="text-right">{m.admin_intel_col_actions()}</TableHead>
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
										title={m.admin_intel_runs_row_title()}
									>
										<TableCell className="font-medium">
											<span className="inline-flex items-center gap-1.5">
												<ChevronRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
												{run.userName}
											</span>
										</TableCell>
										<TableCell>
											<Badge variant="outline">{runTriggerLabel(run.trigger)}</Badge>
										</TableCell>
										<TableCell>
											<div className="flex flex-col items-start gap-0.5">
												<StatusBadge run={run} />
												<StepBreakdown counts={run.stepCounts} />
											</div>
										</TableCell>
										<TableCell className="text-muted-foreground text-xs">{formatTimeAgo(run.startedAt)}</TableCell>
										<TableCell className="tabular-nums text-xs">{run.durationMs ? formatDuration(run.durationMs) : '-'}</TableCell>
										<TableCell className="text-xs">{summarizeRecCounts(run)}</TableCell>
										<TableCell className="text-xs tabular-nums">
											{run.tokensIn ? `${compactNumber(run.tokensOut ?? 0)} / ${compactNumber(run.tokensIn)}` : '-'}
										</TableCell>
										<TableCell className="text-right">
											<div onClick={e => e.stopPropagation()} className="flex justify-end">
												<div className="hidden lg:flex gap-1.5">
													<Button size="xs" variant="outline" onClick={() => onOpenRun?.(run.id)}>
														{m.admin_intel_action_inspect()}
													</Button>
													<Button size="xs" variant="outline" onClick={() => onRunForUser?.(run.userId)}>
														{m.admin_intel_action_rerun()}
													</Button>
													<Button size="xs" variant="outline" onClick={() => onInvalidateHash?.(run.userId)}>
														{m.admin_intel_action_invalidate()}
													</Button>
													<Button size="xs" variant="outline" onClick={() => onPurgeRecs?.(run.userId)}>
														{m.admin_intel_action_purge()}
													</Button>
												</div>
												<div className="lg:hidden">
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button size="icon-xs" variant="outline" aria-label={m.admin_intel_run_actions_label()}>
																<MoreHorizontal className="size-4" />
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end">
															<DropdownMenuItem onSelect={() => onOpenRun?.(run.id)}>{m.admin_intel_action_inspect()}</DropdownMenuItem>
															<DropdownMenuItem onSelect={() => onRunForUser?.(run.userId)}>
																{m.admin_intel_action_rerun()}
															</DropdownMenuItem>
															<DropdownMenuItem onSelect={() => onInvalidateHash?.(run.userId)}>
																{m.admin_intel_action_invalidate()}
															</DropdownMenuItem>
															<DropdownMenuItem onSelect={() => onPurgeRecs?.(run.userId)}>{m.admin_intel_action_purge()}</DropdownMenuItem>
														</DropdownMenuContent>
													</DropdownMenu>
												</div>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</CardContent>
		</Card>
	)
}

// Compact step breakdown (e.g. "3 ok · 2 err · 1 noop") that lives under
// the run-level Status badge. Lets admins see partial failures without
// us having to invent a "partial" run status.
function StepBreakdown({ counts }: { counts?: AdminRunRow['stepCounts'] }) {
	if (!counts) return null
	const total = counts.ok + counts.error + counts.noop
	if (total === 0) return null
	const segments: Array<{ text: string; tone: 'ok' | 'err' | 'noop' }> = []
	if (counts.ok > 0) segments.push({ text: m.admin_intel_step_ok({ count: counts.ok }), tone: 'ok' })
	if (counts.error > 0) segments.push({ text: m.admin_intel_step_err({ count: counts.error }), tone: 'err' })
	if (counts.noop > 0) segments.push({ text: m.admin_intel_step_noop({ count: counts.noop }), tone: 'noop' })
	return (
		<div data-intelligence="admin-runs-step-breakdown" className="flex items-center gap-1 text-3xs tabular-nums">
			{segments.map((s, i) => (
				<span key={s.tone} className="inline-flex items-center gap-1">
					<span
						className={cn(
							s.tone === 'ok' && 'text-emerald-600 dark:text-emerald-400',
							s.tone === 'err' && 'text-destructive',
							s.tone === 'noop' && 'text-muted-foreground'
						)}
					>
						{s.text}
					</span>
					{i < segments.length - 1 && <span className="text-muted-foreground">·</span>}
				</span>
			))}
		</div>
	)
}

function StatusBadge({ run }: { run: AdminRunRow }) {
	if (run.status === 'success') return null
	if (run.status === 'error')
		return (
			<span className="inline-flex items-center gap-1.5">
				<Badge variant="destructive">{m.admin_intel_status_error()}</Badge>
				{run.error && <span className="text-xs text-destructive truncate max-w-xs">{run.error}</span>}
			</span>
		)
	if (run.status === 'skipped')
		return (
			<span className="inline-flex items-center gap-1.5">
				<Badge variant="outline">{m.admin_intel_status_skipped()}</Badge>
				{run.skipReason && <span className="text-xs text-muted-foreground">{run.skipReason}</span>}
			</span>
		)
	return <Badge>{m.admin_intel_status_running()}</Badge>
}

function summarizeRecCounts(run: AdminRunRow): string {
	const entries = Object.entries(run.recCounts).filter(([, n]) => n > 0)
	if (entries.length === 0) return '-'
	return entries.map(([id, n]) => `${id.split('-')[0]}:${n}`).join(' · ')
}

function sumBucket(o: Record<string, number>): number {
	return Object.values(o).reduce((s, n) => s + n, 0)
}

// "1.2k" for a thousand and up, the plain number below that. The decimal
// mark follows the page's language; the "k" stays.
function compactNumber(n: number): string {
	if (n >= 1000) return `${formatNumber(n / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false })}k`
	return formatNumber(n, { useGrouping: false, maximumFractionDigits: 20 })
}

export function runStatusLabel(status: 'running' | 'success' | 'error' | 'skipped'): string {
	switch (status) {
		case 'running':
			return m.admin_intel_status_running()
		case 'success':
			return m.admin_intel_status_success()
		case 'error':
			return m.admin_intel_status_error()
		case 'skipped':
			return m.admin_intel_status_skipped()
	}
}

export function runTriggerLabel(trigger: 'cron' | 'manual'): string {
	return trigger === 'cron' ? m.admin_intel_trigger_cron() : m.admin_intel_trigger_manual()
}

function runFilterLabel(filter: 'all' | 'success' | 'skipped' | 'error'): string {
	switch (filter) {
		case 'all':
			return m.admin_intel_filter_all()
		case 'success':
			return m.admin_intel_filter_success()
		case 'skipped':
			return m.admin_intel_filter_skipped()
		case 'error':
			return m.admin_intel_filter_error()
	}
}

function roleLabel(role: 'admin' | 'child'): string {
	return role === 'admin' ? m.admin_intel_role_admin() : m.admin_intel_role_child()
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`
	if (ms < 60_000) {
		const s = ms / 1000
		return s < 10 ? `${s.toFixed(1)}s` : `${Math.floor(s)}s`
	}
	const totalSec = Math.floor(ms / 1000)
	const min = Math.floor(totalSec / 60)
	const s = totalSec % 60
	return s === 0 ? `${min}m` : `${min}m ${s}s`
}

// ─── Charts moved to ./intelligence-charts.tsx so the recharts runtime
// stays out of /admin/intelligence's static graph until the chart cards
// actually mount.

// Re-export for stories that want to assert the formatted "Last updated" rendering
export { format }
