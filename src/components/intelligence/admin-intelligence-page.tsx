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
import { useEffect, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
	// True while the "Run for me now" mutation is in flight. The button
	// disables itself + shows a spinner so admins can't stack requests.
	runForMePending?: boolean
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
	runForMePending,
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
							'bg-gradient-to-br from-amber-500 via-pink-500 to-fuchsia-600',
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

			<EnableToggleCard enabled={enabled} disabled={providerMissing} onToggle={v => patch({ enabled: v })} />

			{enabled && !providerMissing && (
				<>
					<HealthGrid data={data} providerSummary={providerSummary} />
					<ActionsCard onRunForMe={onRunForMe} runForMePending={runForMePending} />
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
		<Card
			data-intelligence="admin-enable-card"
			className={cn(
				enabled &&
					'border-transparent bg-gradient-to-br from-amber-500 via-pink-500 to-fuchsia-600 dark:from-amber-700 dark:via-pink-700 dark:to-fuchsia-800 ring-1 ring-fuchsia-400/40 dark:ring-fuchsia-600/40 shadow-md shadow-fuchsia-500/20'
			)}
		>
			<CardContent className="px-4 py-2.5 flex items-center justify-between gap-4">
				<div className="flex flex-col gap-1 min-w-0">
					<span className={cn('text-lg font-semibold', enabled && 'text-white drop-shadow-sm')}>Intelligence</span>
					<p className={cn('text-sm', enabled ? 'text-white/95' : 'text-muted-foreground')}>
						{enabled
							? 'Recommendations are flowing. Cron is delivering fresh insights, users have the Intelligence page, and manual refresh is unlocked.'
							: 'All recommendation generation is paused. Users do not see the page; manual refresh is blocked. Toggling on enables the rest of this admin surface.'}
						{disabled && ' Configure an AI provider before turning this on.'}
					</p>
				</div>
				<Switch
					data-intelligence="admin-enable-switch"
					size="lg"
					checked={enabled}
					disabled={disabled}
					onCheckedChange={onToggle}
					className={cn(enabled && 'data-checked:bg-white/30 border-white/50')}
				/>
			</CardContent>
		</Card>
	)
}

function AnalyzerBadge({ tone, children }: { tone: 'kind-heuristic' | 'kind-ai' | 'trigger' | 'status'; children: React.ReactNode }) {
	if (tone === 'kind-ai') {
		return (
			<span className="inline-flex items-center rounded-md border border-transparent bg-gradient-to-br from-amber-500 via-pink-500 to-fuchsia-600 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm dark:from-amber-700 dark:via-pink-700 dark:to-fuchsia-800">
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

function AnalyzerBadges({ kind, triggers, status }: { kind: AnalyzerKind; triggers: Array<AnalyzerTrigger>; status?: AnalyzerStatus }) {
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
							variant="ghost"
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

function ActionsCard({ onRunForMe, runForMePending }: { onRunForMe?: () => void; runForMePending?: boolean }) {
	return (
		<Card data-intelligence="admin-actions-card" size="sm">
			<CardHeader>
				<CardTitle>Actions</CardTitle>
				<CardDescription>Manually trigger a run. More targets (other users, batches) will live here.</CardDescription>
			</CardHeader>
			<CardContent className="pb-4">
				<div className="flex flex-wrap items-center gap-2">
					<Button
						data-intelligence="admin-run-for-me"
						data-pending={runForMePending ? 'true' : 'false'}
						size="sm"
						variant="outline"
						onClick={onRunForMe}
						disabled={runForMePending}
					>
						{runForMePending ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
						{runForMePending ? 'Running…' : 'Run for me now'}
					</Button>
				</div>
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

// Per-analyzer descriptions for the Analyzers section. Hardcoded here so
// admins see what each toggle actually does without having to dig into
// the analyzer source. Keep these short — long copy belongs in docs.
type AnalyzerKind = 'heuristic' | 'ai'
type AnalyzerTrigger = 'cron' | 'manual'
type AnalyzerStatus = 'coming-soon'

const ANALYZER_META: Record<
	AnalyzerId,
	{ label: string; description: string; kind: AnalyzerKind; triggers: Array<AnalyzerTrigger>; status?: AnalyzerStatus }
> = {
	'primary-list': {
		label: 'Primary list',
		description: 'Suggests setting a primary list when the user has multiple active lists but none are marked primary.',
		kind: 'heuristic',
		triggers: ['cron', 'manual'],
	},
	'stale-items': {
		label: 'Stale items',
		description: 'Reviews items not edited in 6+ months and asks the model to flag any worth cleaning up.',
		kind: 'ai',
		triggers: ['cron', 'manual'],
	},
	duplicates: {
		label: 'Duplicates',
		description: 'Finds items with similar titles across different lists and asks the model to confirm true duplicates.',
		kind: 'ai',
		triggers: ['cron', 'manual'],
	},
	grouping: {
		label: 'Grouping',
		description: 'Reserved toggle — analyzer not yet implemented. Enabling it has no effect today.',
		kind: 'ai',
		triggers: ['cron', 'manual'],
		status: 'coming-soon',
	},
}

function SettingsPanel({ data, patch }: { data: AdminIntelligenceData; patch: (p: Partial<AdminIntelligenceData['settings']>) => void }) {
	const s = data.settings
	const audienceCount = data.health.queue.overdue
	return (
		<Card data-intelligence="admin-settings" size="sm">
			<CardHeader>
				<CardTitle>Settings</CardTitle>
				<CardDescription>All settings are global. Per-user overrides aren&apos;t supported yet.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3 pb-4">
				<SettingsSection
					id="schedule"
					icon={CalendarClock}
					title="Schedule & triggers"
					summary={`Cron every ${s.refreshIntervalDays}d · manual cooldown ${s.manualRefreshCooldownMinutes}m`}
					defaultOpen
				>
					<p className="text-xs text-muted-foreground">
						Recommendations regenerate on a per-user cron and on manual &quot;Run for me now&quot; clicks. Each user is eligible no more
						often than the cron interval; manual runs are gated by the cooldown to prevent stacking.
					</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
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
						Each analyzer runs in sequence per user. Errors in one don&apos;t block the others — partial failures show under each run&apos;s
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
						potentially missed recs. Dry run leaves the model calls + step rows in place but skips writing recommendations to the DB.
					</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label="Candidate cap per analyzer"
							hint="Hard limit on items / pairs sent to the model in a single run."
							value={s.candidateCap}
							onChange={v => patch({ candidateCap: v })}
						/>
						<ToggleRow label="Dry run (don't persist recs)" checked={s.dryRun} onChange={v => patch({ dryRun: v })} />
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
					summary={`recs ${s.staleRecRetentionDays}d · run steps ${s.runStepsRetentionDays}d`}
				>
					<p className="text-xs text-muted-foreground">
						Old, dismissed/applied recommendations and old run-step debug rows are pruned on this schedule.
					</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
						<NumberRow
							label="Stale rec retention (days)"
							hint="Dismissed/applied recs older than this are deleted."
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

function SettingsSection({
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

function TextInputOnBlur({
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

function NumberRow({ label, value, onChange, hint }: { label: string; value: number; onChange: (n: number) => void; hint?: string }) {
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
									<TableCell className="text-muted-foreground text-xs">{formatDistanceToNow(run.startedAt, { addSuffix: true })}</TableCell>
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
		</section>
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
