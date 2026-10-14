// Server-only Sentry SDK wiring. Opt-in: with SENTRY_DSN unset every
// export here is a no-op (no SDK init, no settings read, no network).
//
// This module ends up in more than one server bundle. Nitro bundles the
// server/plugins/* graph on its own, and the TanStack SSR graph (server
// fns, API routes, cron) gets a second copy. A module-level "initialized"
// flag is therefore per-copy: the SSR copy never saw the plugin's init, so
// the bundler proved its flag was always false and compiled
// captureServerException to a bare `return`. State lives in the SDK
// instead (`Sentry.isInitialized()` reads the SDK's global carrier, shared
// by every copy), and capture inits lazily so no bundle depends on the
// plugin having run in its own graph.
//
// The admin kill-switch (enableSentry in app_settings) is applied in
// beforeSend, so it covers the SDK's own unhandled-rejection and
// uncaught-exception captures as well as ours, and is re-read per event so
// flipping it off takes effect without a restart.

import * as Sentry from '@sentry/node'

import { env } from '@/env'
import { getSentryStatus, resolveSentryRelease } from '@/lib/observability/config'
import { scrubEvent } from '@/lib/observability/scrubber'

// Serverless hosts (Vercel) can freeze the function as soon as the response
// is sent, dropping anything still queued in the transport. Capture awaits a
// flush, bounded so a slow or unreachable Sentry host can't hold a request.
const FLUSH_TIMEOUT_MS = 2000

// Last successfully read value of the admin toggle. When the settings read
// itself fails (the database is down, which is exactly the outage worth
// reporting) the last known value decides; with none known yet the event is
// sent, since SENTRY_DSN being set is the operator's opt-in.
let lastKnownAdminEnabled: boolean | undefined

async function adminAllowsSend(): Promise<boolean> {
	try {
		const status = await getSentryStatus()
		lastKnownAdminEnabled = status.enabled
		return status.enabled
	} catch {
		return lastKnownAdminEnabled ?? true
	}
}

async function beforeSend(event: Sentry.ErrorEvent, hint: Sentry.EventHint): Promise<Sentry.ErrorEvent | null> {
	if (!(await adminAllowsSend())) return null
	return scrubEvent(event, hint)
}

export function initSentryServer(): void {
	if (!env.SENTRY_DSN) return
	if (Sentry.isInitialized()) return
	Sentry.init({
		dsn: env.SENTRY_DSN,
		environment: env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
		release: resolveSentryRelease(),
		tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE ?? 0,
		sendDefaultPii: false,
		beforeSend,
	})
}

export function isSentryServerInitialized(): boolean {
	return Sentry.isInitialized()
}

// Report an error and wait (bounded) for it to leave the process. Never
// throws: callers are already on an error path.
export async function captureServerException(err: unknown, extra?: Record<string, unknown>): Promise<void> {
	if (!env.SENTRY_DSN) return
	try {
		initSentryServer()
		Sentry.captureException(err, extra ? { extra } : undefined)
		await Sentry.flush(FLUSH_TIMEOUT_MS)
	} catch {
		// Reporting must never turn one failure into two.
	}
}
