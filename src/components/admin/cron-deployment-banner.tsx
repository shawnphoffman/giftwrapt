import { Triangle } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { BUILD_INFO } from '@/lib/build-info'

// Renders only on Vercel deployments. Vercel cron schedules are static
// in `vercel.json` (read at deploy time), so the admin can't edit them
// from this page; they live as a file in the repo. Tuning knobs that
// the cron handlers themselves consume (concurrency, users-per-tick,
// retention windows) are still editable in /admin and apply normally.

export function CronDeploymentBanner() {
	if (!BUILD_INFO.vercel) return null

	return (
		<Alert>
			<Triangle className="size-4" />
			<AlertTitle>Schedules Are Managed in vercel.json</AlertTitle>
			<AlertDescription>
				This deployment is on Vercel, where cron schedules are read from <code>vercel.json</code> at deploy time and cannot be edited from
				the dashboard. To change a schedule, update the file and redeploy. Hobby tier supports daily-only schedules; Pro unlocks any cron
				expression. Tuning knobs (concurrency, users-per-tick, retention windows) under General / AI / Scraping settings still apply
				normally and can be edited live. The "Run now" button below works regardless and is the easiest way to verify each route is healthy.
			</AlertDescription>
		</Alert>
	)
}
