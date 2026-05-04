import { format, formatDistanceToNow } from 'date-fns'
import { AlertTriangle, CheckCheck, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { useMemo } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import type { IntelligencePageState, Recommendation, RecommendationAction, RecommendationSeverity } from './__fixtures__/types'
import { RecommendationCard } from './recommendation-card'
import { groupKeyForAnalyzer } from './recommendation-group'

type Props = {
	state: IntelligencePageState
	onRefresh?: () => void
	onAction?: (rec: Recommendation, action: RecommendationAction) => void
	onDismiss?: (rec: Recommendation) => void
	onSelectListPicker?: (rec: Recommendation, listId: string) => void
}

const SEVERITY_RANK: Record<RecommendationSeverity, number> = { important: 0, suggest: 1, info: 2 }
const SEVERITY_LABEL: Record<RecommendationSeverity, string> = { important: 'Important', suggest: 'Suggested', info: 'For your info' }
const SEVERITY_DESCRIPTION: Record<RecommendationSeverity, string> = {
	important: 'Worth handling soon - these affect how others see your lists.',
	suggest: 'Optional polish. Apply if you agree, dismiss if not.',
	info: 'Just a heads-up. No action required.',
}
const SEVERITY_ORDER: Array<RecommendationSeverity> = ['important', 'suggest', 'info']

function sortRecs(recs: Array<Recommendation>): Array<Recommendation> {
	return [...recs].sort((a, b) => {
		const sevDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
		if (sevDiff !== 0) return sevDiff
		// within a priority, fall back to a stable order so the ui doesn't churn
		const aGroup = groupKeyForAnalyzer(a.analyzerId)
		const bGroup = groupKeyForAnalyzer(b.analyzerId)
		if (aGroup !== bGroup) return aGroup.localeCompare(bGroup)
		return a.createdAt.getTime() - b.createdAt.getTime()
	})
}

export function IntelligencePageContent({ state, onRefresh, onAction, onDismiss, onSelectListPicker }: Props) {
	if (state.kind === 'disabled') {
		return (
			<div data-intelligence="page" data-page-state="disabled" className="wish-page">
				<Header showRefresh={false} />
				<DisabledState reason={state.reason} />
			</div>
		)
	}

	const data = state.data
	const generating = state.kind === 'generating'
	const errorMessage = state.kind === 'error' ? state.message : null

	const { active, applied, dismissed, sorted } = useMemo(() => {
		const a: Array<Recommendation> = []
		const ap: Array<Recommendation> = []
		const d: Array<Recommendation> = []
		for (const rec of data.recs) {
			if (rec.status === 'active') a.push(rec)
			else if (rec.status === 'applied') ap.push(rec)
			else d.push(rec)
		}
		return { active: a, applied: ap, dismissed: d, sorted: sortRecs(a) }
	}, [data.recs])

	const total = data.recs.length
	const reviewed = applied.length + dismissed.length
	const cooldownActive = data.nextEligibleRefreshAt ? data.nextEligibleRefreshAt.getTime() > Date.now() : false
	const refreshDisabled = generating || cooldownActive

	const groupedActive = useMemo(() => {
		const buckets: Record<RecommendationSeverity, Array<Recommendation>> = { important: [], suggest: [], info: [] }
		for (const rec of sorted) {
			buckets[rec.severity].push(rec)
		}
		return buckets
	}, [sorted])

	return (
		<div data-intelligence="page" data-page-state={state.kind} className="wish-page">
			<Header
				showRefresh
				generating={generating}
				disabled={refreshDisabled}
				onRefresh={onRefresh}
				lastRunAt={data.lastRun?.finishedAt ?? null}
				cooldownActive={cooldownActive}
				nextEligibleRefreshAt={data.nextEligibleRefreshAt ?? null}
			/>

			{total > 0 && <ProgressBar total={total} reviewed={reviewed} active={active.length} />}

			{errorMessage && (
				<Alert data-intelligence="page-error-alert" variant="destructive" className="mb-4">
					<AlertTriangle className="size-4" />
					<AlertTitle>Last run failed</AlertTitle>
					<AlertDescription>{errorMessage}</AlertDescription>
				</Alert>
			)}

			{generating && (
				<Alert data-intelligence="page-generating-alert" className="mb-4">
					<Loader2 className="size-4 animate-spin" />
					<AlertTitle>Working on fresh recommendations</AlertTitle>
					<AlertDescription>This usually takes a few seconds. The list below will update when it finishes.</AlertDescription>
				</Alert>
			)}

			{active.length === 0 && !generating ? (
				<EmptyState dismissedCount={dismissed.length} appliedCount={applied.length} />
			) : (
				<div data-intelligence="page-groups" className="flex flex-col gap-8">
					{SEVERITY_ORDER.map(severity => {
						const recs = groupedActive[severity]
						if (recs.length === 0) return null
						return (
							<section key={severity} data-intelligence="page-group" data-group-severity={severity} className="flex flex-col gap-3">
								<header data-intelligence="page-group-header" className="flex items-baseline justify-between gap-3">
									<div className="flex items-baseline gap-2">
										<h2 className="text-base font-semibold">{SEVERITY_LABEL[severity]}</h2>
										<span className="text-xs text-muted-foreground">{recs.length} active</span>
									</div>
									<p className="text-xs text-muted-foreground hidden sm:block">{SEVERITY_DESCRIPTION[severity]}</p>
								</header>
								<div data-intelligence="page-group-cards" className="flex flex-col gap-3">
									{recs.map(rec => (
										<RecommendationCard
											key={rec.id}
											rec={rec}
											position={{ index: sorted.indexOf(rec) + 1, total: active.length }}
											onAction={onAction}
											onDismiss={onDismiss}
											onSelectListPicker={onSelectListPicker}
										/>
									))}
								</div>
							</section>
						)
					})}
				</div>
			)}

			{(dismissed.length > 0 || applied.length > 0) && (
				<div data-intelligence="page-summary" className="mt-10 text-xs text-muted-foreground">
					{applied.length > 0 && <span>{applied.length} applied · </span>}
					{dismissed.length > 0 && <span>{dismissed.length} dismissed. </span>}
					Dismissed items stay hidden across regenerations until the underlying targets change.
				</div>
			)}
		</div>
	)
}

function Header({
	showRefresh,
	generating = false,
	disabled = false,
	onRefresh,
	lastRunAt = null,
	cooldownActive = false,
	nextEligibleRefreshAt = null,
}: {
	showRefresh: boolean
	generating?: boolean
	disabled?: boolean
	onRefresh?: () => void
	lastRunAt?: Date | null
	cooldownActive?: boolean
	nextEligibleRefreshAt?: Date | null
}) {
	return (
		<div data-intelligence="page-header" className="flex items-start justify-between gap-4 mb-6">
			<div data-intelligence="page-header-title-block" className="flex items-start gap-3">
				<div
					data-intelligence="page-header-icon"
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
					<h1 data-intelligence="page-title" className="text-2xl font-semibold tracking-tight">
						Intelligence
					</h1>
					<p data-intelligence="page-tagline" className="text-sm text-muted-foreground">
						AI-assisted recommendations to keep your lists healthy. Updated periodically; refresh anytime.
					</p>
					{lastRunAt && (
						<p data-intelligence="page-last-updated" className="mt-1 text-xs text-muted-foreground">
							Last updated {formatDistanceToNow(lastRunAt, { addSuffix: true })}
						</p>
					)}
				</div>
			</div>
			{showRefresh && (
				<div data-intelligence="page-refresh-block" className="flex flex-col items-end gap-1">
					<Button data-intelligence="page-refresh-button" size="sm" variant="outline" disabled={disabled} onClick={onRefresh}>
						<RefreshCw className={cn('size-4', generating && 'animate-spin')} />
						{generating ? 'Refreshing' : 'Refresh'}
					</Button>
					{cooldownActive && nextEligibleRefreshAt && (
						<span data-intelligence="page-cooldown-note" className="text-[11px] text-muted-foreground whitespace-nowrap">
							Available again {format(nextEligibleRefreshAt, 'p')}
						</span>
					)}
				</div>
			)}
		</div>
	)
}

function ProgressBar({ total, reviewed, active }: { total: number; reviewed: number; active: number }) {
	const pct = total === 0 ? 0 : Math.round((reviewed / total) * 100)
	return (
		<div data-intelligence="page-progress" className="mb-6 flex flex-col gap-1.5">
			<div data-intelligence="page-progress-meta" className="flex items-baseline justify-between text-xs">
				<span className="font-medium">
					{reviewed} of {total} reviewed
				</span>
				<span className="text-muted-foreground">{active} left to act on</span>
			</div>
			<div data-intelligence="page-progress-track" className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
				<div
					data-intelligence="page-progress-fill"
					className="h-full bg-gradient-to-r from-amber-400 to-fuchsia-500 transition-[width]"
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	)
}

function EmptyState({ dismissedCount, appliedCount }: { dismissedCount: number; appliedCount: number }) {
	return (
		<Card data-intelligence="page-empty-state">
			<CardContent className="p-8 flex flex-col items-center justify-center text-center gap-3">
				<div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
					<CheckCheck className="size-6 text-emerald-600" />
				</div>
				<h2 className="text-lg font-semibold">All caught up</h2>
				<p className="text-sm text-muted-foreground max-w-sm">Nothing left to act on. Check back later, or hit Refresh to look again.</p>
				{(dismissedCount > 0 || appliedCount > 0) && (
					<p className="text-xs text-muted-foreground">
						{appliedCount > 0 && `${appliedCount} applied`}
						{appliedCount > 0 && dismissedCount > 0 && ' · '}
						{dismissedCount > 0 && `${dismissedCount} dismissed`} in this batch.
					</p>
				)}
			</CardContent>
		</Card>
	)
}

function DisabledState({ reason }: { reason: 'feature-disabled' | 'no-provider' }) {
	const message =
		reason === 'feature-disabled'
			? 'The Intelligence feature is currently disabled. An admin can turn it on from the admin Intelligence page.'
			: 'No AI provider is configured. An admin needs to add a provider before recommendations can be generated.'
	return (
		<Card data-intelligence="page-disabled-state" data-disabled-reason={reason}>
			<CardContent className="p-8 flex flex-col items-center justify-center text-center gap-3">
				<div className="flex size-12 items-center justify-center rounded-full bg-muted ring-1 ring-border">
					<Sparkles className="size-6 text-muted-foreground" />
				</div>
				<h2 className="text-lg font-semibold">Intelligence is offline</h2>
				<p className="text-sm text-muted-foreground max-w-sm">{message}</p>
			</CardContent>
		</Card>
	)
}
