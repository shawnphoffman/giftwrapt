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
// `dateSensitive` jobs decide which date it is from the deployment time
// zone when they run, and send user-facing email for that date. Their
// defaults (14:00 / 15:00 UTC) land in the morning across the Americas
// and in the afternoon in Europe; `/admin/scheduling` warns when the
// default lands late at night in the configured zone.

export type CronEndpoint = (typeof cronRegistry)[number]['path']

export const cronRegistry = [
	{
		path: '/api/cron/auto-archive',
		label: 'Auto-archive',
		description:
			'Reveals claimed gifts once their birthday, Christmas, or holiday reveal date has passed, then emails each list owner to tell them who gave what.',
		schedule: '0 14 * * *',
		cadence: 'Daily',
		dateSensitive: true,
	},
	{
		path: '/api/cron/birthday-emails',
		label: 'Birthday emails',
		description: 'Sends birthday greetings on the day and reminders ahead of upcoming events, and cleans up claims left on deleted items.',
		schedule: '0 15 * * *',
		cadence: 'Daily',
		dateSensitive: true,
	},
	{
		path: '/api/cron/cleanup-verification',
		label: 'Verification cleanup',
		description: 'Deletes expired sign-in verification tokens and clears out old job run history.',
		schedule: '0 3 * * *',
		cadence: 'Daily',
	},
	{
		path: '/api/cron/intelligence-recommendations',
		label: 'Intelligence recommendations',
		description: 'Runs the analyzers for each user and saves the recommendations they produce, along with a record of each run.',
		schedule: '0 4 * * *',
		cadence: 'Daily',
	},
	{
		path: '/api/cron/item-scrape-queue',
		label: 'Item scrape queue',
		description: 'Works through items that are waiting to have their product details fetched.',
		schedule: '0 5 * * *',
		cadence: 'Daily',
	},
] as const

export const CRON_ENDPOINTS = cronRegistry.map(e => e.path) as unknown as readonly [CronEndpoint, ...Array<CronEndpoint>]

export function getCronEntry(path: string) {
	return cronRegistry.find(e => e.path === path)
}
