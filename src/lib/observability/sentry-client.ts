// Browser-only Sentry SDK wiring. Initialized from a top-level React
// component (SentryClientInit) after hydration, reading the config that
// the server fn `getObservabilityStatus` returned via React Query.
//
// When the admin toggle is off (or env is missing), the server fn
// returns `{ sentry: { enabled: false } }` and this module's init() is
// never called - the DSN is not present in the HTML payload at all.

import * as Sentry from '@sentry/react'

import { scrubEvent } from '@/lib/observability/scrubber'

export type SentryClientConfig = {
	dsn: string
	environment?: string
	release?: string
	tracesSampleRate?: number
}

let initialized = false

export function initSentryClient(config: SentryClientConfig): void {
	if (initialized) return
	if (typeof window === 'undefined') return
	Sentry.init({
		dsn: config.dsn,
		environment: config.environment,
		release: config.release,
		tracesSampleRate: config.tracesSampleRate ?? 0,
		sendDefaultPii: false,
		beforeSend: scrubEvent,
	})
	initialized = true
}

export function isSentryClientInitialized(): boolean {
	return initialized
}

export function captureClientException(err: unknown, extra?: Record<string, unknown>): void {
	if (!initialized) return
	Sentry.captureException(err, extra ? { extra } : undefined)
}
