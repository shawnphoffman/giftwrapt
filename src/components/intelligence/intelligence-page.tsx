import { format, formatDistanceToNow } from 'date-fns'
import { AlertTriangle, CheckCheck, ChevronDown, ChevronRight, Loader2, RefreshCw, RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import DependentAvatar from '@/components/common/dependent-avatar'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import type { IntelligencePageState, Recommendation, RecommendationAction, RecommendationSeverity } from './__fixtures__/types'
import { buildFilterSections, isRecVisible, ListFilterPopover, type ListFilterSection } from './list-filter-popover'
import { RecommendationCard } from './recommendation-card'
import { groupKeyForAnalyzer } from './recommendation-group'

// One subsection of the "For your dependents" rollup. Each dependent the
// guardian has active recs for becomes one of these. Rendered below the
// user's own recs; dismissed/applied recs roll up into the existing
// dismissed-disclosure rather than appearing here per-dependent.
export type DependentRecGroup = {
	dependent: { id: string; name: string; image: string | null }
	recs: Array<Recommendation>
}

type Props = {
	state: IntelligencePageState
	onRefresh?: () => void
	onAction?: (rec: Recommendation, action: RecommendationAction) => void
	onDismiss?: (rec: Recommendation) => void
	onReactivate?: (rec: Recommendation) => void
	onSelectListPicker?: (rec: Recommendation, listId: string) => void
	// Per-sub-item Skip handler for bundled recs.
	onDismissSubItem?: (rec: Recommendation, subItemId: string) => void
	// Active recs scoped to the user's dependents. Rendered as a
	// "For your dependents" rollup below the user's own recs. Dismissed
	// and applied per-dependent recs roll into the global disclosure
	// below, same as the user's own.
	dependentGroups?: ReadonlyArray<DependentRecGroup>
	// Rec ids whose apply/dismiss mutation is currently in flight. Cards
	// for these ids render a busy overlay so the user can't fire a second
	// action against the same rec before the first round-trips.
	pendingRecIds?: ReadonlySet<string>
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

export function IntelligencePageContent({
	state,
	onRefresh,
	onAction,
	onDismiss,
	onReactivate,
	onSelectListPicker,
	onDismissSubItem,
	dependentGroups,
	pendingRecIds,
}: Props) {
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

	const { active, applied, dismissed } = useMemo(() => {
		const a: Array<Recommendation> = []
		const ap: Array<Recommendation> = []
		const d: Array<Recommendation> = []
		for (const rec of data.recs) {
			if (rec.status === 'active') a.push(rec)
			else if (rec.status === 'applied') ap.push(rec)
			else d.push(rec)
		}
		return { active: a, applied: ap, dismissed: d }
	}, [data.recs])

	const total = data.recs.length
	const reviewed = applied.length + dismissed.length
	const cooldownActive = data.nextEligibleRefreshAt ? data.nextEligibleRefreshAt.getTime() > Date.now() : false
	const refreshDisabled = generating || cooldownActive

	// ─── List filter (session-only, not persisted) ─────────────────────────
	//
	// Derived from active user-scope recs + active dependent-scope recs.
	// Selection state starts with everything checked. As recs come and go
	// across regenerations, the popover's option set shifts; we prune the
	// selected set so it doesn't accumulate stale list ids, and any newly
	// surfaced list defaults to checked.

	const activeDependentGroups = useMemo(
		() => (dependentGroups ?? []).map(g => ({ ...g, recs: g.recs.filter(r => r.status === 'active') })).filter(g => g.recs.length > 0),
		[dependentGroups]
	)

	const filterSections = useMemo(() => buildFilterSections(active, activeDependentGroups), [active, activeDependentGroups])

	const allFilterIds = useMemo(() => {
		const ids = new Set<string>()
		for (const section of filterSections) for (const opt of section.options) ids.add(opt.listId)
		return ids
	}, [filterSections])

	const [selectedListIds, setSelectedListIds] = useState<Set<string>>(allFilterIds)

	// Reconcile selection state with the latest option set. Newly surfaced
	// ids are added to the selection (default "visible"); ids that no
	// longer appear are dropped so the count badge can't show > 0 for
	// invisible options.
	useEffect(() => {
		setSelectedListIds(prev => {
			let changed = false
			const next = new Set<string>()
			for (const id of allFilterIds) {
				if (prev.has(id)) {
					next.add(id)
				} else {
					// If the previous selection had at least one entry and this
					// id is new, default to checked. If the previous selection
					// was empty, the user has explicitly cleared everything;
					// don't undo that.
					if (prev.size > 0) {
						next.add(id)
						changed = true
					}
				}
			}
			for (const id of prev) {
				if (!allFilterIds.has(id)) {
					changed = true
				}
			}
			if (!changed && next.size === prev.size) return prev
			return next
		})
	}, [allFilterIds])

	const visibleActive = useMemo(() => active.filter(r => isRecVisible(r, selectedListIds)), [active, selectedListIds])
	const visibleSorted = useMemo(() => sortRecs(visibleActive), [visibleActive])
	const visibleDependentGroups = useMemo(
		() =>
			activeDependentGroups.map(g => ({ ...g, recs: g.recs.filter(r => isRecVisible(r, selectedListIds)) })).filter(g => g.recs.length > 0),
		[activeDependentGroups, selectedListIds]
	)
	const filterEmpty = allFilterIds.size > 0 && selectedListIds.size === 0

	const groupedActive = useMemo(() => {
		const buckets: Record<RecommendationSeverity, Array<Recommendation>> = { important: [], suggest: [], info: [] }
		for (const rec of visibleSorted) {
			buckets[rec.severity].push(rec)
		}
		return buckets
	}, [visibleSorted])

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
				filterSections={filterSections}
				selectedListIds={selectedListIds}
				onSelectedListIdsChange={setSelectedListIds}
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

			{active.length === 0 && !generating && activeDependentGroups.length === 0 ? (
				<EmptyState dismissedCount={dismissed.length} appliedCount={applied.length} />
			) : filterEmpty ? (
				<FilterEmptyState onSelectAll={() => setSelectedListIds(new Set(allFilterIds))} />
			) : visibleActive.length === 0 && visibleDependentGroups.length === 0 ? (
				<FilterEmptyState onSelectAll={() => setSelectedListIds(new Set(allFilterIds))} />
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
											position={{ index: visibleSorted.indexOf(rec) + 1, total: visibleActive.length }}
											onAction={onAction}
											onDismiss={onDismiss}
											onSelectListPicker={onSelectListPicker}
											onDismissSubItem={onDismissSubItem}
											pending={pendingRecIds?.has(rec.id) ?? false}
										/>
									))}
								</div>
							</section>
						)
					})}
				</div>
			)}

			{visibleDependentGroups.length > 0 && (
				<DependentSections
					groups={visibleDependentGroups}
					onAction={onAction}
					onDismiss={onDismiss}
					onSelectListPicker={onSelectListPicker}
					onDismissSubItem={onDismissSubItem}
					pendingRecIds={pendingRecIds}
				/>
			)}

			{dismissed.length > 0 && <DismissedDisclosure dismissed={dismissed} onReactivate={onReactivate} />}

			{(dismissed.length > 0 || applied.length > 0) && (
				<div data-intelligence="page-summary" className="mt-6 text-xs text-muted-foreground">
					{applied.length > 0 && <span>{applied.length} applied · </span>}
					{dismissed.length > 0 && <span>{dismissed.length} dismissed. </span>}
					Dismissed items stay hidden across regenerations until the underlying targets change, or until you bring one back.
				</div>
			)}
		</div>
	)
}

function DependentSections({
	groups,
	onAction,
	onDismiss,
	onSelectListPicker,
	onDismissSubItem,
	pendingRecIds,
}: {
	groups: ReadonlyArray<DependentRecGroup>
	onAction?: (rec: Recommendation, action: RecommendationAction) => void
	onDismiss?: (rec: Recommendation) => void
	onSelectListPicker?: (rec: Recommendation, listId: string) => void
	onDismissSubItem?: (rec: Recommendation, subItemId: string) => void
	pendingRecIds?: ReadonlySet<string>
}) {
	// Filter to active-only here so the per-dependent counts match what's
	// rendered below. Dismissed/applied per-dependent recs roll into the
	// global disclosure rather than appearing here twice.
	const activeGroups = groups.map(g => ({ ...g, recs: g.recs.filter(r => r.status === 'active') })).filter(g => g.recs.length > 0)
	if (activeGroups.length === 0) return null
	return (
		<section data-intelligence="page-dependents" className="mt-10 flex flex-col gap-6">
			<header data-intelligence="page-dependents-header" className="flex flex-col gap-1">
				<h2 className="text-base font-semibold">For your dependents</h2>
				<p className="text-xs text-muted-foreground">
					Suggestions about lists you manage on someone else&apos;s behalf. They behave just like your own.
				</p>
			</header>
			{activeGroups.map(group => (
				<section
					key={group.dependent.id}
					data-intelligence="page-dependent"
					data-dependent-id={group.dependent.id}
					className="flex flex-col gap-3"
				>
					<header data-intelligence="page-dependent-header" className="flex items-center gap-2">
						<DependentAvatar name={group.dependent.name} image={group.dependent.image} size="small" />
						<span className="text-sm font-medium">{group.dependent.name}</span>
						<span className="text-xs text-muted-foreground">{group.recs.length} active</span>
					</header>
					<div data-intelligence="page-dependent-cards" className="flex flex-col gap-3">
						{group.recs.map((rec, idx) => (
							<RecommendationCard
								key={rec.id}
								rec={rec}
								position={{ index: idx + 1, total: group.recs.length }}
								onAction={onAction}
								onDismiss={onDismiss}
								onSelectListPicker={onSelectListPicker}
								onDismissSubItem={onDismissSubItem}
								pending={pendingRecIds?.has(rec.id) ?? false}
							/>
						))}
					</div>
				</section>
			))}
		</section>
	)
}

function DismissedDisclosure({
	dismissed,
	onReactivate,
}: {
	dismissed: Array<Recommendation>
	onReactivate?: (rec: Recommendation) => void
}) {
	const [open, setOpen] = useState(false)
	return (
		<section
			data-intelligence="dismissed-disclosure"
			data-open={open}
			className="mt-10 rounded-md border border-border bg-card/40 overflow-hidden"
		>
			<button
				type="button"
				data-intelligence="dismissed-toggle"
				className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/40 transition-colors"
				onClick={() => setOpen(o => !o)}
				aria-expanded={open}
			>
				{open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
				Show dismissed
				<span className="text-xs text-muted-foreground tabular-nums">({dismissed.length})</span>
			</button>
			{open && (
				<ul data-intelligence="dismissed-list" className="divide-y divide-border/60">
					{dismissed.map(rec => (
						<DismissedRow key={rec.id} rec={rec} onReactivate={onReactivate} />
					))}
				</ul>
			)}
		</section>
	)
}

function DismissedRow({ rec, onReactivate }: { rec: Recommendation; onReactivate?: (rec: Recommendation) => void }) {
	return (
		<li data-intelligence="dismissed-row" data-rec-id={rec.id} className="flex items-start gap-3 px-3 py-2.5">
			<div className="flex-1 min-w-0">
				<p data-intelligence="dismissed-title" className="text-sm font-medium leading-snug">
					{rec.title}
				</p>
				<p data-intelligence="dismissed-meta" className="text-xs text-muted-foreground">
					Dismissed {rec.dismissedAt ? formatDistanceToNow(rec.dismissedAt, { addSuffix: true }) : 'recently'}
				</p>
			</div>
			<Button
				data-intelligence="dismissed-reactivate"
				size="sm"
				variant="outline"
				className="shrink-0"
				onClick={() => onReactivate?.(rec)}
				disabled={!onReactivate}
			>
				<RotateCcw className="size-3.5" />
				Bring back
			</Button>
		</li>
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
	filterSections,
	selectedListIds,
	onSelectedListIdsChange,
}: {
	showRefresh: boolean
	generating?: boolean
	disabled?: boolean
	onRefresh?: () => void
	lastRunAt?: Date | null
	cooldownActive?: boolean
	nextEligibleRefreshAt?: Date | null
	filterSections?: ReadonlyArray<ListFilterSection>
	selectedListIds?: ReadonlySet<string>
	onSelectedListIdsChange?: (next: Set<string>) => void
}) {
	return (
		<div data-intelligence="page-header" className="flex flex-col gap-3 mb-6">
			<h1 data-intelligence="page-title" className="flex flex-row items-center gap-3">
				<span
					data-intelligence="page-header-icon"
					className={cn(
						'flex size-10 shrink-0 items-center justify-center rounded-xl shadow-sm',
						'bg-linear-to-br from-amber-500 via-pink-500 to-fuchsia-600',
						'dark:from-amber-700 dark:via-pink-700 dark:to-fuchsia-800',
						'ring-1 ring-fuchsia-400/40 dark:ring-fuchsia-600/40'
					)}
				>
					<Sparkles className="size-7 shrink-0 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.4)]" />
				</span>
				Suggestions
			</h1>
			<p data-intelligence="page-tagline" className="text-sm text-muted-foreground">
				These personalized recommendations updated periodically so make sure to check back regularly.
			</p>
			{(lastRunAt || showRefresh) && (
				<div data-intelligence="page-meta-row" className="flex items-center justify-between gap-3 flex-wrap">
					<div className="text-xs text-muted-foreground">
						{lastRunAt ? <>Last updated {formatDistanceToNow(lastRunAt, { addSuffix: true })}</> : null}
					</div>
					{showRefresh && (
						<div data-intelligence="page-refresh-block" className="flex items-center gap-2">
							{cooldownActive && nextEligibleRefreshAt && (
								<span
									data-intelligence="page-cooldown-note"
									className="hidden sm:inline text-[11px] text-muted-foreground whitespace-nowrap"
								>
									Available again {format(nextEligibleRefreshAt, 'p')}
								</span>
							)}
							{filterSections && selectedListIds && onSelectedListIdsChange && (
								<>
									{/* Mobile: icon-only filter button */}
									<div className="sm:hidden">
										<ListFilterPopover sections={filterSections} selected={selectedListIds} onChange={onSelectedListIdsChange} iconOnly />
									</div>
									{/* Desktop: labelled filter button */}
									<div className="hidden sm:block">
										<ListFilterPopover sections={filterSections} selected={selectedListIds} onChange={onSelectedListIdsChange} />
									</div>
								</>
							)}
							<Button
								data-intelligence="page-refresh-button"
								size="sm"
								variant="outline"
								disabled={disabled}
								onClick={onRefresh}
								aria-label="Refresh suggestions"
							>
								<RefreshCw className={cn('size-4', generating && 'animate-spin')} />
								<span className="hidden sm:inline">{generating ? 'Refreshing' : 'Refresh'}</span>
							</Button>
						</div>
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
					className="h-full bg-linear-to-r from-amber-400 to-fuchsia-500 transition-[width]"
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
				<p className="text-sm text-muted-foreground">Nothing left to act on. Check back later, or hit Refresh to look again.</p>
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

function FilterEmptyState({ onSelectAll }: { onSelectAll: () => void }) {
	return (
		<Card data-intelligence="page-filter-empty-state">
			<CardContent className="p-8 flex flex-col items-center justify-center text-center gap-3">
				<div className="flex size-12 items-center justify-center rounded-full bg-muted ring-1 ring-border">
					<CheckCheck className="size-6 text-muted-foreground" />
				</div>
				<h2 className="text-lg font-semibold">No suggestions match the current list filter</h2>
				<p className="text-sm text-muted-foreground">Try expanding the filter to see suggestions for more lists.</p>
				<Button data-intelligence="page-filter-empty-select-all" size="sm" variant="outline" onClick={onSelectAll}>
					Select all
				</Button>
			</CardContent>
		</Card>
	)
}

function DisabledState({ reason }: { reason: 'feature-disabled' | 'no-provider' }) {
	const message =
		reason === 'feature-disabled'
			? 'Suggestions are currently disabled. An admin can turn them on from the admin Intelligence page.'
			: 'No AI provider is configured. An admin needs to add a provider before suggestions can be generated.'
	return (
		<Card data-intelligence="page-disabled-state" data-disabled-reason={reason}>
			<CardContent className="p-8 flex flex-col items-center justify-center text-center gap-3">
				<div className="flex size-12 items-center justify-center rounded-full bg-muted ring-1 ring-border">
					<Sparkles className="size-6 text-muted-foreground" />
				</div>
				<h2 className="text-lg font-semibold">Suggestions are offline</h2>
				<p className="text-sm text-muted-foreground">{message}</p>
			</CardContent>
		</Card>
	)
}
