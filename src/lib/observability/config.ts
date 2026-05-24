// Server-only. Per-request gate for the two opt-in observability families
// (Sentry-compatible error reporting + Prometheus metrics endpoint).
//
// Each family has two gates: the env var (host/secret, immutable per deploy)
// AND the app_settings toggle (admin kill-switch, hot-reloadable). Both must
// be true to emit. Evaluated per request rather than cached at startup so
// flipping the admin toggle off actually kills mid-deploy.
//
// Nothing ever flows to a maintainer-controlled domain. The DSN points
// wherever the operator chose (their Glitchtip, their Sentry org, their
// proxy); the metrics endpoint is scraped by whoever the operator scrapes
// from. See docs/configuration/observability for the full operator picture.

import type { Database, SchemaDatabase } from '@/db'
import { db as defaultDb } from '@/db'
import { env } from '@/env'
import { getAppSettings } from '@/lib/settings-loader'

type DisabledReason = 'env-missing' | 'admin-disabled'

export type SentryStatus =
	| { enabled: false; reason: DisabledReason }
	| {
			enabled: true
			// The DSN is public-by-design (Sentry's SDK ships it in client
			// HTML). Surfaced here only when enabled, so the HTML payload for
			// disabled deployments never carries it.
			dsn: string
			environment?: string
			release?: string
			tracesSampleRate?: number
	  }

export type MetricsStatus = { enabled: false; reason: DisabledReason } | { enabled: true }

async function resolveSettings(dbx: Database | SchemaDatabase | undefined) {
	return getAppSettings(dbx ?? defaultDb)
}

export async function getSentryStatus(dbx?: Database | SchemaDatabase): Promise<SentryStatus> {
	if (!env.SENTRY_DSN) return { enabled: false, reason: 'env-missing' }
	const settings = await resolveSettings(dbx)
	if (!settings.enableSentry) return { enabled: false, reason: 'admin-disabled' }
	return {
		enabled: true,
		dsn: env.SENTRY_DSN,
		environment: env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
		release: env.SENTRY_RELEASE,
		tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
	}
}

export async function getMetricsStatus(dbx?: Database | SchemaDatabase): Promise<MetricsStatus> {
	if (!env.METRICS_TOKEN) return { enabled: false, reason: 'env-missing' }
	const settings = await resolveSettings(dbx)
	if (!settings.enableMetrics) return { enabled: false, reason: 'admin-disabled' }
	return { enabled: true }
}
