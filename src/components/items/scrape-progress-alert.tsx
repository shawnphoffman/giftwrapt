import { AlertCircle, CheckCircle2, Circle, Layers2, Loader2, MinusCircle, XCircle } from 'lucide-react'
import * as React from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ProviderProgress, ScrapeUiState } from '@/lib/use-scrape-url'
import { cn } from '@/lib/utils'

type Props = {
	state: ScrapeUiState
	url?: string
	onCancel?: () => void
	onRetry?: () => void
	className?: string
}

// Renders a per-phase alert summarising a scrape session. The component is
// presentational - the parent owns the URL, the hook, and any retry logic.
//
// Provider ids are resolved to user-facing names via `state.providerNames`
// (populated by the `plan` event); the raw id is the fallback when a name
// isn't supplied (built-ins, mostly).
function displayName(id: string, names: Record<string, string>): string {
	return names[id] ?? id
}

export function ScrapeProgressAlert({ state, url, onCancel, onRetry, className }: Props): React.ReactElement | null {
	if (state.phase === 'idle') return null

	const hostname = url ? safeHostname(url) : null

	if (state.phase === 'failed') {
		return (
			<Alert variant="destructive" className={cn('text-sm', className)}>
				<AlertCircle />
				<AlertTitle>Couldn&apos;t import - please fill in details</AlertTitle>
				<AlertDescription>
					{describeFailure(state)}
					{onRetry && (
						<div className="mt-2">
							<Button type="button" size="sm" variant="outline" onClick={onRetry}>
								Try Again
							</Button>
						</div>
					)}
				</AlertDescription>
			</Alert>
		)
	}

	if (state.phase === 'done') {
		const elapsed = formatDurationMs(state.elapsedMs)
		const title = state.cached ? `Imported from cache in ${elapsed}` : `Imported in ${elapsed}`
		return (
			<Alert variant="default" className={cn('text-sm', className)}>
				<CheckCircle2 className="text-emerald-600 dark:text-emerald-500" />
				<AlertTitle>{title}</AlertTitle>
			</Alert>
		)
	}

	const isPartial = state.phase === 'partial'
	// Only count providers that may still produce a result. `pending` keeps
	// counting (a queued tier may still run); `skipped` does not (its tier
	// was bypassed and will never fire).
	const stillRunning = state.providers.filter(p => p.status === 'pending' || p.status === 'in_progress').length
	const tierByProviderId = useTierLookup(state.tiers)

	return (
		<Alert variant="default" className={cn('text-sm', className)}>
			<Loader2 className="animate-spin text-muted-foreground" />
			<AlertTitle>
				{isPartial && stillRunning > 0
					? `Got initial result. Still checking ${stillRunning} other source${stillRunning === 1 ? '' : 's'} for better data…`
					: isPartial
						? 'Got initial result. Finalizing…'
						: `Importing${hostname ? ` from ${hostname}` : ''}…`}
			</AlertTitle>
			<AlertDescription>
				<ul className="mt-1 space-y-1 text-xs">
					{state.providers.map(p => (
						<ProviderRow
							key={p.providerId}
							progress={p}
							label={displayName(p.providerId, state.providerNames)}
							tier={tierByProviderId.get(p.providerId)}
						/>
					))}
				</ul>
				<div className="mt-2 text-xs text-muted-foreground">
					{formatElapsed(state.elapsedMs, state.totalTimeoutMs)}
					{onCancel && (
						<>
							{' · '}
							<button type="button" onClick={onCancel} className="underline hover:text-foreground">
								{isPartial ? 'Cancel remaining' : 'Cancel'}
							</button>
						</>
					)}
				</div>
			</AlertDescription>
		</Alert>
	)
}

function ProviderRow({ progress, label, tier }: { progress: ProviderProgress; label: string; tier: number | undefined }) {
	const Icon = ICONS[progress.status]
	const { badge, meta } = providerDetail(progress)
	const muted = progress.status === 'skipped'
	const showScoreTiming = progress.status === 'done' && typeof progress.score === 'number' && typeof progress.ms === 'number'
	return (
		<li className={cn('flex items-center gap-2', muted && 'opacity-60')}>
			<Icon className={cn('size-3.5 shrink-0', ICON_TONE[progress.status])} />
			{typeof tier === 'number' && (
				<Badge variant="outline" className="h-4 gap-1 px-1.5 py-0 text-[10px] font-normal text-muted-foreground" title={`Tier ${tier}`}>
					<Layers2 className="size-2.5" aria-hidden="true" />
					{tier}
					<span className="sr-only">Tier {tier}</span>
				</Badge>
			)}
			<span className={cn('font-mono', muted && 'line-through')}>{label}</span>
			{badge && (
				<Badge
					variant={BADGE_VARIANT[progress.status]}
					className={cn('h-4 px-1.5 py-0 text-[10px] font-normal', BADGE_TONE[progress.status])}
				>
					{badge}
				</Badge>
			)}
			{showScoreTiming && <ScoreTimingPill score={progress.score!} ms={progress.ms!} />}
			{meta && <span className="text-muted-foreground">{meta}</span>}
		</li>
	)
}

// Two-segment pill mirroring `<PriceQuantityBadge>`: score on the left,
// elapsed time on the right, separated by a 1px divider. Sized to match
// the surrounding status badge (h-4, text-[10px]). Tones match the existing
// status palette so a green left half reads as "good score" and a sky right
// half as "informational metric".
function ScoreTimingPill({ score, ms }: { score: number; ms: number }) {
	return (
		<span
			className="inline-flex h-4 items-stretch overflow-hidden rounded-full border text-[10px] font-medium whitespace-nowrap"
			title={`Score ${score}, ${formatDurationMs(ms)}`}
		>
			<span className="inline-flex items-center bg-emerald-100 px-1.5 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
				{score}
			</span>
			<span className="w-px bg-border" aria-hidden="true" />
			<span className="inline-flex items-center bg-sky-100 px-1.5 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
				{formatDurationMs(ms)}
			</span>
		</span>
	)
}

// Reverse-index providerId → tier number so a provider row can render its
// tier badge in O(1). Memoised so the map only rebuilds when the tier list
// shape changes.
function useTierLookup(tiers: ScrapeUiState['tiers']): Map<string, number> {
	return React.useMemo(() => {
		const out = new Map<string, number>()
		for (const t of tiers ?? []) {
			for (const id of t.providerIds) out.set(id, t.tier)
		}
		return out
	}, [tiers])
}

const ICONS = {
	pending: Circle,
	in_progress: SpinnerIcon,
	done: CheckCircle2,
	failed: XCircle,
	skipped: MinusCircle,
} as const satisfies Record<ProviderProgress['status'], React.ComponentType<{ className?: string }>>

const ICON_TONE: Record<ProviderProgress['status'], string> = {
	pending: 'text-muted-foreground',
	in_progress: 'text-muted-foreground',
	done: 'text-emerald-600 dark:text-emerald-500',
	failed: 'text-destructive',
	skipped: 'text-muted-foreground',
}

const BADGE_VARIANT: Record<ProviderProgress['status'], 'secondary' | 'outline' | 'destructive' | 'default'> = {
	pending: 'outline',
	in_progress: 'secondary',
	done: 'secondary',
	failed: 'destructive',
	skipped: 'outline',
}

const BADGE_TONE: Record<ProviderProgress['status'], string> = {
	pending: 'text-muted-foreground',
	in_progress: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
	done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
	failed: '',
	skipped: 'text-muted-foreground',
}

function SpinnerIcon({ className }: { className?: string }): React.ReactElement {
	return <Loader2 className={cn('animate-spin', className)} />
}

function providerDetail(p: ProviderProgress): { badge: string | null; meta: string | null } {
	switch (p.status) {
		case 'pending':
			return { badge: 'pending', meta: null }
		case 'in_progress':
			return { badge: 'in progress', meta: null }
		case 'done':
			// Score + duration render as a separate two-segment pill on the
			// row, so meta stays empty here.
			return { badge: 'done', meta: null }
		case 'failed':
			return {
				badge: p.errorCode ?? 'failed',
				meta: typeof p.ms === 'number' ? formatDurationMs(p.ms) : null,
			}
		case 'skipped':
			return { badge: 'skipped', meta: null }
	}
}

function describeFailure(state: ScrapeUiState): string {
	const map: Record<string, string> = {
		'all-providers-failed': 'No scraper could read this URL.',
		'invalid-url': 'That URL is invalid.',
		'not-authorized': 'You are not signed in.',
		timeout: 'The scrape timed out.',
		'no-providers-available': 'No scrapers are configured for this deployment.',
		'stream-closed': 'The connection closed unexpectedly.',
	}
	return state.reason ? (map[state.reason] ?? `Scrape failed (${state.reason}).`) : 'Scrape failed.'
}

function formatElapsed(elapsedMs: number, totalTimeoutMs: number | undefined): string {
	const elapsed = formatDurationMs(elapsedMs)
	if (!totalTimeoutMs) return `Elapsed ${elapsed}`
	return `Elapsed ${elapsed} of ${formatDurationMs(totalTimeoutMs)} budget`
}

function formatDurationMs(ms: number): string {
	if (ms < 1000) return `${ms}ms`
	const s = ms / 1000
	if (s < 10) return `${s.toFixed(1)}s`
	return `${Math.round(s)}s`
}

function safeHostname(url: string): string | null {
	try {
		return new URL(url).hostname.replace(/^www\./, '')
	} catch {
		return null
	}
}
