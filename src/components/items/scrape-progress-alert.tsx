import { AlertCircle, CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react'
import * as React from 'react'

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
								Try again
							</Button>
						</div>
					)}
				</AlertDescription>
			</Alert>
		)
	}

	if (state.phase === 'done') {
		return (
			<Alert variant="default" className={cn('text-sm', className)}>
				<CheckCircle2 className="text-emerald-600 dark:text-emerald-500" />
				<AlertTitle>{state.cached ? 'Imported (from cache)' : 'Imported'}</AlertTitle>
				<AlertDescription>
					{describeWinner(state)} {formatDurationMs(state.elapsedMs)}.
				</AlertDescription>
			</Alert>
		)
	}

	const isPartial = state.phase === 'partial'
	const stillRunning = state.providers.filter(p => p.status === 'pending' || p.status === 'in_progress').length

	return (
		<Alert variant="default" className={cn('text-sm', className)}>
			<Loader2 className="animate-spin text-muted-foreground" />
			<AlertTitle>
				{isPartial
					? `Imported. Still checking ${stillRunning} other source${stillRunning === 1 ? '' : 's'}…`
					: `Importing${hostname ? ` from ${hostname}` : ''}…`}
			</AlertTitle>
			<AlertDescription>
				<ul className="mt-1 space-y-1 text-xs">
					{state.providers.map(p => (
						<ProviderRow key={p.providerId} progress={p} />
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
			{onCancel && (
				<AlertAction>
					<Button type="button" size="sm" variant="ghost" onClick={onCancel}>
						{isPartial ? 'Cancel remaining' : 'Cancel'}
					</Button>
				</AlertAction>
			)}
		</Alert>
	)
}

function ProviderRow({ progress }: { progress: ProviderProgress }) {
	const Icon = ICONS[progress.status]
	const detail = providerDetail(progress)
	return (
		<li className="flex items-center gap-2">
			<Icon className={cn('size-3.5 shrink-0', ICON_TONE[progress.status])} />
			<span className="font-mono">{progress.providerId}</span>
			{detail && <span className="text-muted-foreground">- {detail}</span>}
		</li>
	)
}

const ICONS = {
	pending: Circle,
	in_progress: SpinnerIcon,
	done: CheckCircle2,
	failed: XCircle,
} as const satisfies Record<ProviderProgress['status'], React.ComponentType<{ className?: string }>>

const ICON_TONE: Record<ProviderProgress['status'], string> = {
	pending: 'text-muted-foreground',
	in_progress: 'text-muted-foreground',
	done: 'text-emerald-600 dark:text-emerald-500',
	failed: 'text-destructive',
}

function SpinnerIcon({ className }: { className?: string }): React.ReactElement {
	return <Loader2 className={cn('animate-spin', className)} />
}

function providerDetail(p: ProviderProgress): string | null {
	switch (p.status) {
		case 'pending':
			return 'pending'
		case 'in_progress':
			return 'in progress'
		case 'done':
			return (
				[typeof p.score === 'number' ? `score ${p.score}` : null, typeof p.ms === 'number' ? formatDurationMs(p.ms) : null]
					.filter(Boolean)
					.join(', ') || 'done'
			)
		case 'failed':
			return [p.errorCode ?? 'failed', typeof p.ms === 'number' ? formatDurationMs(p.ms) : null].filter(Boolean).join(', ')
	}
}

function describeWinner(state: ScrapeUiState): string {
	if (!state.fromProvider) return 'Imported scrape data.'
	const title = state.result?.title
	if (title) return `Imported "${title}" via ${state.fromProvider} in`
	return `Imported via ${state.fromProvider} in`
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
