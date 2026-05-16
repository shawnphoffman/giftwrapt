import { format, formatDistanceToNow } from 'date-fns'
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
import { cn } from '@/lib/utils'

const AI_SETTINGS_HREF = '/admin/ai'

import { Skeleton } from '@/components/ui/skeleton'

import type { AdminIntelligenceData, AdminRunRow, AnalyzerId } from './__fixtures__/types'

// recharts is ~350 KB. The two chart cards only render when the page
// has actual rec-run telemetry; load the chart island lazily so the
// rest of the admin intelligence shell paints first.
const RunsActivityChart = lazy(() => import('./intelligence-charts').then(m => ({ default: m.RunsActivityChart })))
const TokenUsageChart = lazy(() => import('./intelligence-charts').then(m => ({ default: m.TokenUsageChart })))
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
	// userId currently running, if any, so per-row "Run" buttons can show
	// a spinner without stacking requests.
	runningUserId?: string | null
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
	runningUserId,
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
							'flex size-10 shrink-0 items-center justify-center rounded-xl shadow-sm',
							'bg-linear-to-br from-amber-500 via-pink-500 to-fuchsia-600',
							'dark:from-amber-700 dark:via-pink-700 dark:to-fuchsia-800',
							'ring-1 ring-fuchsia-400/40 dark:ring-fuchsia-600/40'
						)}
					>
						<Sparkles className="size-5 shrink-0 text-amber-100 drop-shadow-[0_0_4px_rgba(255,255,255,0.6)]" />
					</div>
					<div>
						<h1 className="text-2xl font-semibold tracking-tight">Intelligence</h1>
						<p className="text-sm text-muted-foreground">Configure analyzers, debug runs, and inspect costs.</p>
					</div>
				</div>
			</header>

			{providerMissing && <ProviderMissingBanner />}

			{!enabled && (
				<Alert data-intelligence="admin-intelligence-disabled-banner">
					<AlertTitle>Intelligence is disabled</AlertTitle>
					<AlertDescription className="flex flex-col gap-2">
						<span>All recommendation generation is paused. Users do not see the Intelligence page; manual refresh is blocked.</span>
						<a
							className="inline-flex items-center gap-1 self-start rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium hover:bg-muted/60"
							href="/admin/ai"
						>
							Enable on AI settings
							<ArrowUpRight className="size-3.5" />
						</a>
					</AlertDescription>
				</Alert>
			)}

			{enabled && !providerMissing && (
				<>
					<HealthGrid data={data} providerSummary={providerSummary} />
					<ActionsCard summaries={userSummaries} onRunForUser={onRunForUser} runningUserId={runningUserId} />
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
					<CardContent className="p-6 text-center text-sm text-muted-foreground">
						Settings, analyzers, and run history are hidden until an AI provider is configured. Once a provider is set up, this page will
						populate.
					</CardContent>
				</Card>
			)}
		</div>
	)
}

export function ProviderMissingBanner() {
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

function AnalyzerBadge({ tone, children }: { tone: 'kind-heuristic' | 'kind-ai' | 'trigger' | 'status'; children: React.ReactNode }) {
	if (tone === 'kind-ai') {
		return (
			<span className="inline-flex items-center rounded-md bg-linear-to-br from-amber-500 via-pink-500 to-fuchsia-600 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm dark:from-amber-700 dark:via-pink-700 dark:to-fuchsia-800">
				{children}
			</span>
		)
	}
	if (tone === 'kind-heuristic') {
		return (
			<Badge variant="secondary" className="text-[10px]">
				{children}
			</Badge>
		)
	}
	if (tone === 'status') {
		return (
			<Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-400">
				{children}
			</Badge>
		)
	}
	return (
		<Badge variant="outline" className="text-[10px]">
			{children}
		</Badge>
	)
}

function AnalyzerBadgeList({ kind, triggers, status }: { kind: AnalyzerKind; triggers: Array<AnalyzerTrigger>; status?: AnalyzerStatus }) {
	return (
		<>
			<AnalyzerBadge tone={kind === 'ai' ? 'kind-ai' : 'kind-heuristic'}>{kind === 'ai' ? 'AI' : 'Heuristic'}</AnalyzerBadge>
			{triggers.includes('cron') && <AnalyzerBadge tone="trigger">Cron</AnalyzerBadge>}
			{triggers.includes('manual') && <AnalyzerBadge tone="trigger">Manual</AnalyzerBadge>}
			{status === 'coming-soon' && <AnalyzerBadge tone="status">Coming Soon</AnalyzerBadge>}
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
							size="sm"
							variant="outline"
							className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
							aria-label="Show analyzer details"
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
	runningUserId,
}: {
	summaries: ReadonlyArray<AdminUserRunSummaryRow>
	onRunForUser?: (userId: string) => void
	runningUserId?: string | null
}) {
	const sorted = React.useMemo(() => sortSummaries(summaries), [summaries])
	return (
		<Card data-intelligence="admin-actions-card">
			<CardHeader>
				<CardTitle className="text-2xl">Actions</CardTitle>
				<CardDescription>
					Trigger a manual run for any user. Last run + active rec count below help find who&apos;s overdue.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Table data-intelligence="admin-actions-user-table">
					<TableHeader>
						<TableRow>
							<TableHead>User</TableHead>
							<TableHead className="hidden md:table-cell">Last run</TableHead>
							<TableHead className="text-right">Recs (active / dismissed / applied)</TableHead>
							<TableHead className="text-right">Run</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{sorted.map(row => (
							<UserActionRow key={row.userId} row={row} onRunForUser={onRunForUser} runningUserId={runningUserId} />
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
	runningUserId,
}: {
	row: AdminUserRunSummaryRow
	onRunForUser?: (userId: string) => void
	runningUserId?: string | null
}) {
	const pending = runningUserId === row.userId
	const initials = (row.name ?? row.email).slice(0, 2).toUpperCase()
	return (
		<TableRow data-intelligence="admin-actions-user-row" data-user-id={row.userId} data-is-me={row.isMe ? 'true' : 'false'}>
			<TableCell>
				<div className="flex items-center gap-2 min-w-0">
					<Avatar className="size-7 shrink-0">
						{row.image && <AvatarImage src={row.image} alt={row.name ?? row.email} />}
						<AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
					</Avatar>
					<div className="flex flex-col min-w-0">
						<span className="text-sm font-medium truncate flex items-center gap-1.5">
							{row.name ?? row.email}
							{row.isMe && (
								<Badge variant="secondary" className="text-[10px]">
									you
								</Badge>
							)}
							{row.role !== 'user' && (
								<Badge variant="outline" className="text-[10px]">
									{row.role}
								</Badge>
							)}
						</span>
						<span className="text-[11px] text-muted-foreground truncate">{row.email}</span>
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
					{pending ? 'Running' : 'Run'}
				</Button>
			</TableCell>
		</TableRow>
	)
}

function LastRunCell({ row }: { row: AdminUserRunSummaryRow }) {
	if (!row.lastRunAt) {
		return <span className="text-xs text-muted-foreground italic">never run</span>
	}
	const variant: 'destructive' | 'secondary' | 'outline' = row.lastRunStatus === 'error' ? 'destructive' : 'secondary'
	return (
		<div className="flex flex-col gap-0.5">
			<span className="text-xs text-muted-foreground" title={format(row.lastRunAt, 'PPpp')}>
				{formatDistanceToNow(row.lastRunAt, { addSuffix: true })}
			</span>
			<span className="flex items-center gap-1.5">
				{row.lastRunStatus && (
					<Badge variant={variant} className="text-[10px]">
						{row.lastRunStatus}
					</Badge>
				)}
				{row.lastRunSkipReason && <span className="text-[10px] text-muted-foreground font-mono">{row.lastRunSkipReason}</span>}
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
				label="Active Recs"
				value={health.totalActiveRecs.toString()}
				sub={`across ${health.analyzers.length} analyzers`}
				gradient="from-fuchsia-400/40 via-pink-400/30 to-rose-500/40"
			/>
			<MetricCard
				icon={PlayCircle}
				label="Runs (24h)"
				value={`${health.last24h.success} ok`}
				sub={`${sumBucket(health.last24h.skipped)} skipped · ${health.last24h.error} error`}
				gradient="from-emerald-400/40 via-teal-400/30 to-cyan-500/40"
			/>
			<MetricCard
				icon={Hash}
				label="Tokens / Day"
				value={`${formatNumber(health.dailyTokensIn + health.dailyTokensOut)}`}
				sub={`${formatNumber(health.dailyTokensIn)} in · ${formatNumber(health.dailyTokensOut)} out`}
				gradient="from-amber-400/40 via-orange-400/30 to-pink-500/40"
			/>
			<MetricCard
				icon={Cpu}
				label="Cost / Day"
				value={`~$${health.dailyEstimatedCostUsd.toFixed(2)}`}
				sub={providerSummary}
				gradient="from-violet-400/40 via-purple-400/30 to-fuchsia-500/40"
			/>

			<div className="lg:col-span-2 xl:col-span-4 grid grid-cols-1 xl:grid-cols-2 gap-3">
				<Suspense fallback={<ChartCardFallback title="Runs (14 days)" />}>
					<RunsActivityChart data={data.dailySeries} />
				</Suspense>
				<Suspense fallback={<ChartCardFallback title="Tokens & cost (14 days)" />}>
					<TokenUsageChart data={data.dailySeries} />
				</Suspense>
			</div>

			<div className="lg:col-span-2 xl:col-span-4">
				<Card>
					<CardHeader>
						<CardTitle className="text-2xl">Analyzers</CardTitle>
						<CardDescription>Average duration · tokens · active recommendations</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-4 gap-3">
							{health.analyzers.map(a => (
								<div key={a.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
									<div className="flex items-center justify-between">
										<span className="text-sm font-medium">{a.label}</span>
										<Badge variant={a.enabled ? 'secondary' : 'outline'}>{a.enabled ? 'on' : 'off'}</Badge>
									</div>
									<div className="mt-1 text-xs text-muted-foreground">
										{a.avgDurationMs}ms · {formatNumber(a.avgTokensIn)} in / {formatNumber(a.avgTokensOut)} out
									</div>
									<div className="text-xs">{a.activeRecs} active recommendations</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			</div>

			<div className="lg:col-span-2 xl:col-span-4">
				<Card>
					<CardHeader>
						<CardTitle className="text-2xl">Queue</CardTitle>
						<CardDescription>
							7d: {health.last7d.success} ok · {sumBucket(health.last7d.skipped)} skipped · {health.last7d.error} err
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
							<QueueStat icon={TimerReset} label="Overdue" value={health.queue.overdue} />
							<QueueStat icon={Hash} label="Gated by unread" value={health.queue.gatedByUnreadRecs} />
							<QueueStat icon={Lock} label="Lock held" value={health.queue.lockHeld} />
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
	{ label: string; description: string; example: string; kind: AnalyzerKind; triggers: Array<AnalyzerTrigger>; status?: AnalyzerStatus }
> = {
	'primary-list': {
		label: 'Primary List',
		description: 'Suggests setting a primary list when the user has multiple active lists but none are marked primary.',
		example:
			'You have 3 active wishlists but none are marked primary. Set one so people who want to shop for you know where to look first.',
		kind: 'heuristic',
		triggers: ['cron', 'manual'],
	},
	'list-hygiene': {
		label: 'List Hygiene',
		description:
			"Calendar-aware nudges to reshape lists for upcoming auto-archive events (birthdays, Christmas, custom holidays). Suggests convert / make-public / create / set-primary, depending on the user's current lists.",
		example:
			'Your birthday is in 14 days and your only public list is a Christmas list. Convert it to a birthday list and rename it so gifts auto-reveal on the right day.',
		kind: 'heuristic',
		triggers: ['cron', 'manual'],
	},
	'relation-labels': {
		label: 'Relation Labels',
		description: "Nudges users to declare mother / father relationships when Mother's/Father's Day approaches.",
		example: "Mother's Day is in 7 days. Tag a parent so the system can remind you and shape your gift-tracking.",
		kind: 'heuristic',
		triggers: ['cron', 'manual'],
	},
	'stale-items': {
		label: 'Stale Items',
		description: 'Reviews items not edited in 6+ months and asks the model to flag any worth cleaning up.',
		example:
			'"Wireless headphones (model XYZ)" hasn\'t been touched in 11 months and the linked product is discontinued. Consider archiving or replacing it.',
		kind: 'ai',
		triggers: ['cron', 'manual'],
	},
	duplicates: {
		label: 'Duplicates',
		description: 'Finds items with similar titles across different lists and asks the model to confirm true duplicates.',
		example:
			'"Stanley tumbler 30oz" appears on both your Birthday list and your Wishlist. Looks like the same item, so keep one and remove the other.',
		kind: 'ai',
		triggers: ['cron', 'manual'],
	},
	grouping: {
		label: 'Grouping',
		description:
			'Suggests "pick one" or "in order" groups for ungrouped items that look like alternates of the same need or a prerequisite sequence.',
		example: 'These three coffee grinders look like alternates of the same need. Group as "pick one" so gifters know to only buy one.',
		kind: 'ai',
		triggers: ['cron', 'manual'],
	},
	'missing-price': {
		label: 'Missing Prices',
		description: 'Surfaces items that have a URL but no price recorded so the user can fill one in.',
		example: '"Stanley tumbler 30oz" has a link but no price set. Adding one helps gifters budget.',
		kind: 'heuristic',
		triggers: ['cron', 'manual'],
	},
	'missing-image': {
		label: 'Unselected Images',
		description: 'Surfaces items where the scraper found candidate images but none have been picked yet.',
		example: 'The scraper found 4 candidate images for "Levis 511" but no image is set on the item. Pick one.',
		kind: 'heuristic',
		triggers: ['cron', 'manual'],
	},
	'stale-scrape': {
		label: 'Stale or Unscraped URLs',
		description: "Surfaces items whose linked product hasn't been re-scraped in months (or was never scraped).",
		example: 'The link on "Wireless headphones" was last scraped 9 months ago. Refresh to catch price/availability changes.',
		kind: 'heuristic',
		triggers: ['cron', 'manual'],
	},
	'clothing-prefs': {
		label: 'Clothing Size & Color',
		description: 'Asks the model to flag clothing items missing a size or color and suggest common options.',
		example: '"Levis 511 jeans" has no size noted - common adult sizes are 30x32, 32x32, 34x32. Add yours.',
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
				<CardTitle className="text-2xl">Settings</CardTitle>
				<CardDescription>All settings are global. Per-user overrides aren&apos;t supported yet.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3 pb-4">
				<SettingsSection
					id="schedule"
					icon={CalendarClock}
					title="Schedule & Triggers"
					summary={`Cron every ${s.refreshIntervalDays}d · manual cooldown ${s.manualRefreshCooldownMinutes}m`}
					defaultOpen
				>
					<p className="text-xs text-muted-foreground">
						Recommendations regenerate on a per-user cron and on manual &quot;Run for me now&quot; clicks. Each user is eligible no more
						often than the cron interval; manual runs are gated by the cooldown to prevent stacking.
					</p>
					<div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label="Cron refresh interval (days)"
							hint="How often the cron will regenerate recommendations for each user."
							value={s.refreshIntervalDays}
							onChange={v => patch({ refreshIntervalDays: v })}
						/>
						<NumberRow
							label="Manual refresh cooldown (min)"
							hint="Minimum gap between manual runs for the same user."
							value={s.manualRefreshCooldownMinutes}
							onChange={v => patch({ manualRefreshCooldownMinutes: v })}
						/>
					</div>
				</SettingsSection>

				<SettingsSection
					id="analyzers"
					icon={Sparkles}
					title="Analyzers"
					summary={`${ANALYZER_ORDER.filter(id => s.perAnalyzerEnabled[id]).length} of ${ANALYZER_ORDER.length} enabled`}
					defaultOpen
				>
					<p className="text-xs text-muted-foreground">
						Each analyzer runs in sequence per user. Errors in one don&apos;t block the others; partial failures show under each run&apos;s
						status in the table below.
					</p>
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
											<span className="text-sm font-medium">{meta.label}</span>
											<AnalyzerBadges kind={meta.kind} triggers={meta.triggers} status={meta.status} />
										</div>
										<p className="text-xs text-muted-foreground">{meta.description}</p>
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
					title="Audience"
					summary={`${audienceCount} eligible user${audienceCount === 1 ? '' : 's'}`}
				>
					<p className="text-xs text-muted-foreground">
						Today the cron processes every non-banned user. Per-cohort enablement isn&apos;t supported yet; if you need to scope rollout,
						disable individual analyzers above or turn the whole feature off.
					</p>
					<div className="rounded-md border border-border bg-muted/10 px-3 py-2 text-xs">
						<div className="text-muted-foreground">Eligible users</div>
						<div className="text-base font-semibold tabular-nums">{audienceCount}</div>
					</div>
				</SettingsSection>

				<SettingsSection
					id="inputs"
					icon={Beaker}
					title="Inputs & dry run"
					summary={s.dryRun ? `cap ${s.candidateCap} · dry run on` : `cap ${s.candidateCap} · persisting`}
				>
					<p className="text-xs text-muted-foreground">
						The candidate cap bounds how many items each analyzer feeds into the model. Smaller caps mean cheaper / faster runs but
						potentially missed recommendations. Dry run leaves the model calls + step rows in place but skips writing recommendations to the
						database.
					</p>
					<div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label="Candidate cap per analyzer"
							hint="Hard limit on items / pairs sent to the model in a single run."
							value={s.candidateCap}
							onChange={v => patch({ candidateCap: v })}
						/>
						<ToggleRow label="Dry run (don't persist recommendations)" checked={s.dryRun} onChange={v => patch({ dryRun: v })} />
					</div>
				</SettingsSection>

				<SettingsSection
					id="cron-workers"
					icon={Cpu}
					title="Cron workers"
					summary={`${s.concurrency}× concurrency · ${s.usersPerInvocation} users / invocation`}
				>
					<p className="text-xs text-muted-foreground">
						Advanced. Controls how many users the cron processes per invocation and how many run in parallel. Raise these only after
						confirming provider quota; rate-limit errors will show up as step errors on individual runs.
					</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label="Cron concurrency"
							hint="Number of users processed in parallel inside one invocation."
							value={s.concurrency}
							onChange={v => patch({ concurrency: v })}
						/>
						<NumberRow
							label="Users per cron invocation"
							hint="Maximum users the cron will pick up before yielding."
							value={s.usersPerInvocation}
							onChange={v => patch({ usersPerInvocation: v })}
						/>
					</div>
				</SettingsSection>

				<SettingsSection
					id="retention"
					icon={Database}
					title="Retention"
					summary={`recommendations ${s.staleRecRetentionDays}d · run steps ${s.runStepsRetentionDays}d`}
				>
					<p className="text-xs text-muted-foreground">
						Old, dismissed/applied recommendations and old run-step debug rows are pruned on this schedule.
					</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label="Stale recommendation retention (days)"
							hint="Dismissed and applied recommendations older than this are deleted."
							value={s.staleRecRetentionDays}
							onChange={v => patch({ staleRecRetentionDays: v })}
						/>
						<NumberRow
							label="Run-step retention (days)"
							hint="Per-step debug rows (prompt / response / parsed) older than this are deleted."
							value={s.runStepsRetentionDays}
							onChange={v => patch({ runStepsRetentionDays: v })}
						/>
					</div>
				</SettingsSection>

				<SettingsSection
					id="notifications"
					icon={Mail}
					title="Notifications"
					summary={s.email.enabled ? 'email on' : 'email off'}
					badge="scaffold only"
				>
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
							<TextInputOnBlur
								className="mt-1"
								type="email"
								placeholder="optional"
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
								<Badge variant="outline" className="text-[10px]">
									{badge}
								</Badge>
							)}
						</div>
						<span className="text-[11px] text-muted-foreground truncate">{summary}</span>
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

export function TextInputOnBlur({
	value,
	onCommit,
	className,
	type = 'text',
	placeholder,
}: {
	value: string
	onCommit: (v: string) => void
	className?: string
	type?: string
	placeholder?: string
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
			{hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
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
					<CardTitle className="text-2xl">Recent Runs</CardTitle>
					<CardDescription>Most recent recommendation runs across every user. Click a row to inspect run details.</CardDescription>
				</div>
				<div data-intelligence="admin-runs-filter" className="flex items-center gap-1.5">
					{(['all', 'success', 'skipped', 'error'] as const).map(f => (
						<Button
							key={f}
							data-intelligence="admin-runs-filter-button"
							data-filter-value={f}
							size="xs"
							variant={filter === f ? 'default' : 'outline'}
							className="uppercase"
							onClick={() => setFilter(f)}
						>
							{f}
						</Button>
					))}
				</div>
			</CardHeader>
			<CardContent>
				{runs.length === 0 ? (
					<p data-intelligence="admin-runs-empty" className="text-sm text-muted-foreground py-2">
						No runs match this filter.
					</p>
				) : (
					<div className="rounded-lg border overflow-x-auto">
						<Table data-intelligence="admin-runs-table">
							<TableHeader>
								<TableRow>
									<TableHead>User</TableHead>
									<TableHead>Trigger</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Started</TableHead>
									<TableHead>Duration</TableHead>
									<TableHead>Recommendations</TableHead>
									<TableHead>Tokens (out / in)</TableHead>
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
											<div className="flex flex-col items-start gap-0.5">
												<StatusBadge run={run} />
												<StepBreakdown counts={run.stepCounts} />
											</div>
										</TableCell>
										<TableCell className="text-muted-foreground text-xs">
											{formatDistanceToNow(run.startedAt, { addSuffix: true })}
										</TableCell>
										<TableCell className="tabular-nums text-xs">{run.durationMs ? formatDuration(run.durationMs) : '-'}</TableCell>
										<TableCell className="text-xs">{summarizeRecCounts(run)}</TableCell>
										<TableCell className="text-xs tabular-nums">
											{run.tokensIn ? `${formatNumber(run.tokensOut ?? 0)} / ${formatNumber(run.tokensIn)}` : '-'}
										</TableCell>
										<TableCell className="text-right">
											<div onClick={e => e.stopPropagation()} className="flex justify-end">
												<div className="hidden lg:flex gap-1.5">
													<Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onOpenRun?.(run.id)}>
														Inspect
													</Button>
													<Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onRunForUser?.(run.userId)}>
														Re-run
													</Button>
													<Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onInvalidateHash?.(run.userId)}>
														Invalidate
													</Button>
													<Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onPurgeRecs?.(run.userId)}>
														Purge
													</Button>
												</div>
												<div className="lg:hidden">
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button size="sm" variant="outline" className="h-7 w-7 p-0" aria-label="Run actions">
																<MoreHorizontal className="size-4" />
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end">
															<DropdownMenuItem onSelect={() => onOpenRun?.(run.id)}>Inspect</DropdownMenuItem>
															<DropdownMenuItem onSelect={() => onRunForUser?.(run.userId)}>Re-run</DropdownMenuItem>
															<DropdownMenuItem onSelect={() => onInvalidateHash?.(run.userId)}>Invalidate</DropdownMenuItem>
															<DropdownMenuItem onSelect={() => onPurgeRecs?.(run.userId)}>Purge</DropdownMenuItem>
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
	const segments: Array<{ label: string; n: number; tone: 'ok' | 'err' | 'noop' }> = []
	if (counts.ok > 0) segments.push({ label: 'ok', n: counts.ok, tone: 'ok' })
	if (counts.error > 0) segments.push({ label: 'err', n: counts.error, tone: 'err' })
	if (counts.noop > 0) segments.push({ label: 'noop', n: counts.noop, tone: 'noop' })
	return (
		<div data-intelligence="admin-runs-step-breakdown" className="flex items-center gap-1 text-[10px] tabular-nums">
			{segments.map((s, i) => (
				<span key={s.label} className="inline-flex items-center gap-1">
					<span
						className={cn(
							s.tone === 'ok' && 'text-emerald-600 dark:text-emerald-400',
							s.tone === 'err' && 'text-destructive',
							s.tone === 'noop' && 'text-muted-foreground'
						)}
					>
						{s.n} {s.label}
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

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`
	if (ms < 60_000) {
		const s = ms / 1000
		return s < 10 ? `${s.toFixed(1)}s` : `${Math.floor(s)}s`
	}
	const totalSec = Math.floor(ms / 1000)
	const m = Math.floor(totalSec / 60)
	const s = totalSec % 60
	return s === 0 ? `${m}m` : `${m}m ${s}s`
}

// ─── Charts moved to ./intelligence-charts.tsx so the recharts runtime
// stays out of /admin/intelligence's static graph until the chart cards
// actually mount.

// Re-export for stories that want to assert the formatted "Last updated" rendering
export { format }
