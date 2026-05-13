// Registry of /api/cron/* endpoints. Source of truth for the admin
// scheduling page (labels + descriptions + suggested cron expressions)
// and for `recordCronRun`'s endpoint validation. Keep in sync with
// vercel.json (the actual scheduler-of-record on Vercel) and
// .notes/architecture/cron-and-jobs.md when adding a new route.
//
// Schedules below match the daily cadences shipped in vercel.json so the
// `/admin/scheduling` "next fire" estimate matches reality on the
// default Vercel deployment. Self-hosters / Render / Railway operators
// may run jobs at higher cadences (the runners themselves are designed
// for it), so treat these strings as the documented default, not a
// hard cap.

export type CronEndpoint = (typeof cronRegistry)[number]['path']

export const cronRegistry = [
	{
		path: '/api/cron/auto-archive',
		label: 'Auto-archive',
		description: 'Archives claimed items past birthday/Christmas reveal date.',
		schedule: '0 6 * * *',
		cadence: 'Daily',
	},
	{
		path: '/api/cron/birthday-emails',
		label: 'Birthday emails',
		description: 'Day-of greetings + 14-day post-birthday gift summaries.',
		schedule: '0 7 * * *',
		cadence: 'Daily',
	},
	{
		path: '/api/cron/cleanup-verification',
		label: 'Verification cleanup',
		description: 'Deletes expired better-auth verification rows; sweeps cron_runs retention.',
		schedule: '0 3 * * *',
		cadence: 'Daily',
	},
	{
		path: '/api/cron/intelligence-recommendations',
		label: 'Intelligence recommendations',
		description: 'Runs the per-user analyzer pipeline; persists recommendations + run rows.',
		schedule: '0 4 * * *',
		cadence: 'Daily',
	},
	{
		path: '/api/cron/item-scrape-queue',
		label: 'Item scrape queue',
		description: 'Drains pending item_scrape_jobs rows.',
		schedule: '0 5 * * *',
		cadence: 'Daily',
	},
] as const

export const CRON_ENDPOINTS = cronRegistry.map(e => e.path) as unknown as readonly [CronEndpoint, ...Array<CronEndpoint>]

export function getCronEntry(path: string) {
	return cronRegistry.find(e => e.path === path)
}
