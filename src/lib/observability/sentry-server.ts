// Server-only Sentry SDK wiring. Initialized at Nitro boot (see
// server/plugins/sentry.ts) when SENTRY_DSN is set. Per-request enable
// state is gated through getSentryStatus so the admin toggle can kill
// emission without a restart - SDK stays initialized; we just skip
// captureException.

import * as Sentry from '@sentry/node'

import { env } from '@/env'
import { getSentryStatus } from '@/lib/observability/config'
import { scrubEvent } from '@/lib/observability/scrubber'

let initialized = false

export function initSentryServer(): void {
	if (initialized) return
	if (!env.SENTRY_DSN) return
	Sentry.init({
		dsn: env.SENTRY_DSN,
		environment: env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
		release: env.SENTRY_RELEASE,
		tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE ?? 0,
		sendDefaultPii: false,
		beforeSend: scrubEvent,
	})
	initialized = true
}

export function isSentryServerInitialized(): boolean {
	return initialized
}

export async function captureServerException(err: unknown, extra?: Record<string, unknown>): Promise<void> {
	if (!initialized) return
	const status = await getSentryStatus()
	if (!status.enabled) return
	Sentry.captureException(err, extra ? { extra } : undefined)
}
