// Registry of /api/cron/* endpoints. Source of truth for the admin
// scheduling page (labels + descriptions + suggested cron expressions)
// and for `recordCronRun`'s endpoint validation. Keep in sync with
// vercel.json (the actual scheduler-of-record on Vercel) and
// docs/architecture/cron-and-jobs.md when adding a new route.
//
// Schedules below match the daily cadences shipped in vercel.json so the
// `/admin/scheduling` "next fire" estimate matches reality on the
// default Vercel deployment. Self-hosters / Render / Railway operators
// may run jobs at higher cadences (the runners themselves are designed
// for it), so treat these strings as the documented default, not a
// hard cap.
//
// The job names and descriptions an admin reads are catalog text, looked
// up by path in `cronJobLabel` / `cronJobDescription` below. `cadence` is
// a stable English key (the scheduling panel also derives the expected
// interval from it); `cronCadenceLabel` gives the text to show for it.
//
// `dateSensitive` jobs decide which date it is from the deployment time
// zone when they run, and send user-facing email for that date. Their
// defaults (14:00 / 15:00 UTC) land in the morning across the Americas
// and in the afternoon in Europe; `/admin/scheduling` warns when the
// default lands late at night in the configured zone.

import { m } from '@/paraglide/messages.js'

export type CronEndpoint = (typeof cronRegistry)[number]['path']

export const cronRegistry = [
	{
		path: '/api/cron/auto-archive',
		schedule: '0 14 * * *',
		cadence: 'Daily',
		dateSensitive: true,
	},
	{
		path: '/api/cron/birthday-emails',
		schedule: '0 15 * * *',
		cadence: 'Daily',
		dateSensitive: true,
	},
	{
		path: '/api/cron/cleanup-verification',
		schedule: '0 3 * * *',
		cadence: 'Daily',
	},
	{
		path: '/api/cron/intelligence-recommendations',
		schedule: '0 4 * * *',
		cadence: 'Daily',
	},
	{
		path: '/api/cron/item-scrape-queue',
		schedule: '0 5 * * *',
		cadence: 'Daily',
	},
] as const

export const CRON_ENDPOINTS = cronRegistry.map(e => e.path) as unknown as readonly [CronEndpoint, ...Array<CronEndpoint>]

export function getCronEntry(path: string) {
	return cronRegistry.find(e => e.path === path)
}

export type CronCadence = (typeof cronRegistry)[number]['cadence']

export function cronJobLabel(path: CronEndpoint): string {
	switch (path) {
		case '/api/cron/auto-archive':
			return m.admin_cron_job_auto_archive_label()
		case '/api/cron/birthday-emails':
			return m.admin_cron_job_birthday_emails_label()
		case '/api/cron/cleanup-verification':
			return m.admin_cron_job_cleanup_verification_label()
		case '/api/cron/intelligence-recommendations':
			return m.admin_cron_job_intelligence_recommendations_label()
		case '/api/cron/item-scrape-queue':
			return m.admin_cron_job_item_scrape_queue_label()
	}
}

export function cronJobDescription(path: CronEndpoint): string {
	switch (path) {
		case '/api/cron/auto-archive':
			return m.admin_cron_job_auto_archive_description()
		case '/api/cron/birthday-emails':
			return m.admin_cron_job_birthday_emails_description()
		case '/api/cron/cleanup-verification':
			return m.admin_cron_job_cleanup_verification_description()
		case '/api/cron/intelligence-recommendations':
			return m.admin_cron_job_intelligence_recommendations_description()
		case '/api/cron/item-scrape-queue':
			return m.admin_cron_job_item_scrape_queue_description()
	}
}

// A record, not a switch, because there is one cadence today; the type
// still fails the build when a new cadence has no text.
const CADENCE_TEXT: Record<CronCadence, () => string> = {
	Daily: () => m.admin_cron_job_cadence_daily(),
}

export function cronCadenceLabel(cadence: CronCadence): string {
	return CADENCE_TEXT[cadence]()
}

// For a path read back from run history, which can name a job that has
// since been removed from the registry: its label, or the path itself.
export function cronJobLabelOrPath(path: string): string {
	const entry = getCronEntry(path)
	return entry ? cronJobLabel(entry.path) : path
}
