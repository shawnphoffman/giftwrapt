import { Clock } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useAdminAppSettings } from '@/hooks/use-app-settings'
import { type LateCronRun, lateDateSensitiveRuns } from '@/lib/cron/schedule-zone'

// Warns when a date-sensitive job's default schedule lands late at night
// in the deployment time zone. The job still picks the right date, but
// that day's emails go out late in the evening or overnight. Based on the
// registry defaults (which vercel.json / render.yaml ship); a custom
// scheduler may already run at a better time.
export function CronTimeZoneBanner() {
	const { data: settings } = useAdminAppSettings()
	if (!settings) return null
	return <CronTimeZoneWarning timeZone={settings.timeZone} late={lateDateSensitiveRuns(settings.timeZone)} />
}

export function CronTimeZoneWarning({ timeZone, late }: { timeZone: string; late: ReadonlyArray<LateCronRun> }) {
	if (late.length === 0) return null

	return (
		<Alert>
			<Clock className="size-4" />
			<AlertTitle>Daily Emails Run Late at Night in {timeZone}</AlertTitle>
			<AlertDescription className="space-y-2">
				<p>These jobs use the date in {timeZone}, so their default schedule sends each day&apos;s emails late that night:</p>
				<ul className="list-disc pl-5">
					{late.map(run => (
						<li key={run.path}>
							{run.label} (<code>{run.schedule}</code> UTC) runs at {run.localTime}
						</li>
					))}
				</ul>
				<p>
					Move them to a morning time in {timeZone} in your scheduler (<code>vercel.json</code>, <code>render.yaml</code>, or the cron
					sidecar). If your scheduler already runs them at a better time, you can ignore this.
				</p>
			</AlertDescription>
		</Alert>
	)
}
