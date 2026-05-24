// Server-only. Prometheus registry + the typed counters/histograms used
// to feed it. All instruments are registered eagerly at module load;
// the /api/metrics route gates exposure via getMetricsStatus, but
// counters increment regardless of whether anyone is scraping. This
// keeps domain call sites zero-conditional (one-line `counter.inc(...)`
// at the success path).
//
// Cardinality: every label below is enum-bounded - list types from the
// schema enum, cron job names from the registry, status_class
// constrained to the five strings below. `route` is the matched route
// template (e.g. /api/cron/auto-archive) or the literal 'unmatched';
// raw URLs with IDs never become labels.

import { Counter, Histogram, Registry } from 'prom-client'

export const registry = new Registry()

// Default labels applied to every metric. Keep this minimal; runtime
// labels (job, list_type, etc.) go on the specific metric.
registry.setDefaultLabels({ service: 'giftwrapt' })

// HTTP request latency. Status class is the bucket, not the exact code,
// so cardinality stays bounded to (route templates) x (methods) x 5.
export const httpRequestDurationMs = new Histogram({
	name: 'http_request_duration_ms',
	help: 'HTTP request duration in milliseconds, by matched route template, method, and status class.',
	labelNames: ['route', 'method', 'status_class'] as const,
	buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000],
	registers: [registry],
})

// Cron run metrics. `outcome` matches the cron_runs.status enum used by
// the existing in-app /admin/scheduling history.
export const cronRunDurationMs = new Histogram({
	name: 'cron_run_duration_ms',
	help: 'Cron run duration in milliseconds, by job and resolved outcome.',
	labelNames: ['job', 'outcome'] as const,
	buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10_000, 30_000, 60_000, 300_000],
	registers: [registry],
})

export const cronRunOutcomesTotal = new Counter({
	name: 'cron_run_outcomes_total',
	help: 'Cron run outcomes, by job. Outcomes match cron_runs.status (success, error, skipped).',
	labelNames: ['job', 'outcome'] as const,
	registers: [registry],
})

// Domain counters. Kept unlabeled for v1 - per-call-site lookups just
// to populate a `list_type` label would mean an extra DB hit on every
// claim/item mutation. Split labelled variants can be added later if a
// concrete dashboard need surfaces.
const unlabeledCounter = (name: string, help: string) => new Counter({ name, help, registers: [registry] })

export const claimsCreatedTotal = unlabeledCounter('claims_created_total', 'Gift claims created (gifter assigned to an item).')
export const claimsDeletedTotal = unlabeledCounter('claims_deleted_total', 'Gift claims deleted (unclaim).')
export const itemsCreatedTotal = unlabeledCounter('items_created_total', 'Items created on a list.')
export const itemsArchivedTotal = unlabeledCounter('items_archived_total', 'Items archived (revealed to recipient).')
export const itemsPendingDeletionTotal = unlabeledCounter(
	'items_pending_deletion_total',
	'Items flipped to pending-deletion via recipient delete on a claimed item.'
)

// `type` is already in scope at the createList call site (it's an input
// arg), so the label costs nothing extra.
export const listsCreatedTotal = new Counter({
	name: 'lists_created_total',
	help: 'Lists created, by type.',
	labelNames: ['type'] as const,
	registers: [registry],
})

export const revealsTriggeredTotal = new Counter({
	name: 'reveals_triggered_total',
	help: 'Reveals (item archive) triggered, by trigger source.',
	labelNames: ['trigger'] as const,
	registers: [registry],
})

export const orphanClaimsCleanedUpTotal = new Counter({
	name: 'orphan_claims_cleaned_up_total',
	help: 'Orphan claims hard-deleted by the daily cleanup pass.',
	registers: [registry],
})

export const intelligenceRunsCompletedTotal = new Counter({
	name: 'intelligence_runs_completed_total',
	help: 'Intelligence (recommendations) cron runs completed, by outcome.',
	labelNames: ['outcome'] as const,
	registers: [registry],
})

export type StatusClass = '2xx' | '3xx' | '4xx' | '5xx' | 'unmatched'

export function statusClassFor(status: number): StatusClass {
	if (status >= 500) return '5xx'
	if (status >= 400) return '4xx'
	if (status >= 300) return '3xx'
	if (status >= 200) return '2xx'
	return 'unmatched'
}
