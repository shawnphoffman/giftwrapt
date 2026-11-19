import { Clock } from 'lucide-react'

import { RichMessage } from '@/components/common/rich-message'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useAdminAppSettings } from '@/hooks/use-app-settings'
import { cronJobLabel } from '@/lib/cron/registry'
import { type LateCronRun, lateDateSensitiveRuns } from '@/lib/cron/schedule-zone'
import { m } from '@/paraglide/messages.js'

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
			<AlertTitle>{m.admin_settings_cron_tz_banner_title({ timeZone })}</AlertTitle>
			<AlertDescription className="space-y-2">
				<p>{m.admin_settings_cron_tz_banner_intro({ timeZone })}</p>
				<ul className="list-disc pl-5">
					{late.map(run => (
						<li key={run.path}>
							<RichMessage
								parts={m.admin_settings_cron_tz_banner_run.parts({
									label: cronJobLabel(run.path),
									schedule: run.schedule,
									localTime: run.localTime,
								})}
								tags={{ code: children => <code>{children}</code> }}
							/>
						</li>
					))}
				</ul>
				<p>
					<RichMessage
						parts={m.admin_settings_cron_tz_banner_fix.parts({ timeZone })}
						tags={{ code: children => <code>{children}</code> }}
					/>
				</p>
			</AlertDescription>
		</Alert>
	)
}
