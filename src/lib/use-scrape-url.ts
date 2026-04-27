import { useCallback, useEffect, useRef, useState } from 'react'

import { parseStreamLine } from './scrapers/sse-format'
import type { OrchestrateErrorReason, ScrapeErrorCode, ScrapeResult, StreamEvent } from './scrapers/types'

// ===========================================================================
// State machine surfaced to consumers (the add-item form, the progress alert)
// ===========================================================================

export type ProviderStatus = 'pending' | 'in_progress' | 'done' | 'failed'

export type ProviderProgress = {
	providerId: string
	status: ProviderStatus
	score?: number
	ms?: number
	errorCode?: ScrapeErrorCode
}

export type ScrapeUiPhase = 'idle' | 'scraping' | 'partial' | 'done' | 'failed'

export type TierStatus = 'pending' | 'in_progress' | 'done' | 'skipped'

export type TierProgress = {
	tier: number
	providerIds: Array<string>
	status: TierStatus
	// Populated on tier_completed. `mergedScore` is null when every
	// provider in the tier failed; non-null even when the tier didn't
	// clear threshold (the merged result is still recorded for fallback).
	mergedScore?: number | null
	contributors?: Array<string>
	cleared?: boolean
}

export type ScrapeUiState = {
	phase: ScrapeUiPhase
	providers: Array<ProviderProgress>
	// Map of provider id → user-facing label, populated by the `plan` event.
	// Components fall back to the provider id when an entry isn't present.
	providerNames: Record<string, string>
	elapsedMs: number
	totalTimeoutMs?: number
	result?: ScrapeResult
	fromProvider?: string
	cached?: boolean
	reason?: OrchestrateErrorReason | 'stream-closed'
	// Per-tier progress, populated from the `plan` event and updated by
	// tier_started/tier_completed/tier_skipped. Undefined before the
	// first plan arrives.
	tiers?: Array<TierProgress>
}

export type StartOptions = {
	force?: boolean
	itemId?: number
	providerOverride?: Array<string>
}

const initialState: ScrapeUiState = {
	phase: 'idle',
	providers: [],
	providerNames: {},
	elapsedMs: 0,
}

// ===========================================================================
// Hook
// ===========================================================================

// Manages a scrape session against `/api/scrape/stream`. Imperative API
// (start / cancel) so callers can fire scrapes on URL paste, blur, or
// button click without coupling render cycles to URL changes.
export function useScrapeUrl(): {
	state: ScrapeUiState
	start: (url: string, opts?: StartOptions) => void
	cancel: () => void
} {
	const [state, setState] = useState<ScrapeUiState>(initialState)
	const sourceRef = useRef<EventSource | null>(null)
	const startedAtRef = useRef<number>(0)
	const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

	const stopTicker = useCallback(() => {
		if (tickRef.current !== null) {
			clearInterval(tickRef.current)
			tickRef.current = null
		}
	}, [])

	const closeSource = useCallback(() => {
		stopTicker()
		const src = sourceRef.current
		sourceRef.current = null
		if (src) {
			try {
				src.close()
			} catch {
				// already closed
			}
		}
	}, [stopTicker])

	const cancel = useCallback(() => {
		closeSource()
		setState(prev => {
			if (prev.phase === 'done' || prev.phase === 'failed' || prev.phase === 'idle') return prev
			return { ...prev, phase: 'failed', reason: 'stream-closed' }
		})
	}, [closeSource])

	const start = useCallback(
		(url: string, opts: StartOptions = {}) => {
			closeSource()
			setState({ ...initialState, phase: 'scraping' })
			startedAtRef.current = Date.now()
			tickRef.current = setInterval(() => {
				setState(prev => {
					if (prev.phase !== 'scraping' && prev.phase !== 'partial') return prev
					return { ...prev, elapsedMs: Date.now() - startedAtRef.current }
				})
			}, 250)

			if (typeof window === 'undefined') return

			const params = new URLSearchParams({ url })
			if (opts.force) params.set('force', 'true')
			if (opts.itemId) params.set('itemId', String(opts.itemId))
			for (const id of opts.providerOverride ?? []) params.append('provider', id)

			let source: EventSource
			try {
				source = new EventSource(`/api/scrape/stream?${params.toString()}`)
			} catch {
				setState({ ...initialState, phase: 'failed', reason: 'stream-closed' })
				stopTicker()
				return
			}
			sourceRef.current = source

			source.onmessage = (e: MessageEvent<string>) => {
				const event = parseStreamLine(`data: ${e.data}\n\n`)
				if (!event) return
				setState(prev => reduce(prev, event))
				if (event.type === 'done' || event.type === 'error') {
					closeSource()
				}
			}

			source.onerror = () => {
				// EventSource auto-reconnects unless we close it. If the route
				// already emitted a terminal event, sourceRef is null and this
				// onerror is the natural socket close — ignore. Otherwise treat
				// it as a hard failure and surface it.
				if (sourceRef.current === null) return
				closeSource()
				setState(prev => {
					if (prev.phase === 'done' || prev.phase === 'failed') return prev
					return { ...prev, phase: 'failed', reason: 'stream-closed' }
				})
			}
		},
		[closeSource, stopTicker]
	)

	useEffect(() => {
		return () => {
			closeSource()
		}
	}, [closeSource])

	return { state, start, cancel }
}

// ===========================================================================
// Pure reducer (exported for tests)
// ===========================================================================

export function reduce(state: ScrapeUiState, event: StreamEvent): ScrapeUiState {
	switch (event.type) {
		case 'plan': {
			const tieredIds = event.tiers.flatMap(t => t.providerIds)
			const providers: Array<ProviderProgress> = [...tieredIds, ...event.parallelRacers].map(id => ({
				providerId: id,
				status: 'pending',
			}))
			return {
				...state,
				phase: state.phase === 'idle' ? 'scraping' : state.phase,
				providers,
				providerNames: event.providerNames,
				totalTimeoutMs: event.totalTimeoutMs,
				tiers: event.tiers.map(t => ({ tier: t.tier, providerIds: [...t.providerIds], status: 'pending' as const })),
			}
		}
		case 'tier_started': {
			return {
				...state,
				tiers: state.tiers?.map(t => (t.tier === event.tier ? { ...t, status: 'in_progress' as const } : t)),
			}
		}
		case 'tier_completed': {
			return {
				...state,
				tiers: state.tiers?.map(t =>
					t.tier === event.tier
						? {
								...t,
								status: 'done' as const,
								mergedScore: event.mergedScore,
								contributors: [...event.contributors],
								cleared: event.cleared,
							}
						: t
				),
			}
		}
		case 'tier_skipped': {
			return {
				...state,
				tiers: state.tiers?.map(t => (t.tier === event.tier ? { ...t, status: 'skipped' as const } : t)),
			}
		}
		case 'attempt_started': {
			return { ...state, providers: upsertProvider(state.providers, event.providerId, p => ({ ...p, status: 'in_progress' })) }
		}
		case 'attempt_completed': {
			return {
				...state,
				providers: upsertProvider(state.providers, event.providerId, p => ({ ...p, status: 'done', score: event.score, ms: event.ms })),
			}
		}
		case 'attempt_failed': {
			return {
				...state,
				providers: upsertProvider(state.providers, event.providerId, p => ({
					...p,
					status: 'failed',
					ms: event.ms,
					errorCode: event.errorCode,
				})),
			}
		}
		case 'result_ready': {
			return {
				...state,
				phase: 'partial',
				result: event.result,
				fromProvider: event.fromProvider,
				cached: event.cached,
			}
		}
		case 'result_updated': {
			return {
				...state,
				result: event.result,
				fromProvider: event.fromProvider,
			}
		}
		case 'done': {
			return { ...state, phase: state.result ? 'done' : 'failed', reason: state.result ? undefined : 'all-providers-failed' }
		}
		case 'error': {
			return { ...state, phase: 'failed', reason: event.reason }
		}
	}
}

function upsertProvider(
	current: ReadonlyArray<ProviderProgress>,
	providerId: string,
	updater: (existing: ProviderProgress) => ProviderProgress
): Array<ProviderProgress> {
	const idx = current.findIndex(p => p.providerId === providerId)
	if (idx === -1) return [...current, updater({ providerId, status: 'pending' })]
	const next = [...current]
	const existing = next[idx]
	next[idx] = updater(existing)
	return next
}
