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

export type ObservabilityFamilyStatus = {
	enabled: boolean
	reason?: 'env-missing' | 'admin-disabled'
}

async function resolveSettings(dbx: Database | SchemaDatabase | undefined) {
	return getAppSettings(dbx ?? defaultDb)
}

export async function getSentryStatus(dbx?: Database | SchemaDatabase): Promise<ObservabilityFamilyStatus> {
	if (!env.SENTRY_DSN) return { enabled: false, reason: 'env-missing' }
	const settings = await resolveSettings(dbx)
	if (!settings.enableSentry) return { enabled: false, reason: 'admin-disabled' }
	return { enabled: true }
}

export async function getMetricsStatus(dbx?: Database | SchemaDatabase): Promise<ObservabilityFamilyStatus> {
	if (!env.METRICS_TOKEN) return { enabled: false, reason: 'env-missing' }
	const settings = await resolveSettings(dbx)
	if (!settings.enableMetrics) return { enabled: false, reason: 'admin-disabled' }
	return { enabled: true }
}
