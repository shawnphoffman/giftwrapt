// Flags date-sensitive cron defaults that land late at night in the
// deployment time zone. Those jobs send email for "today" in that zone,
// so a default that fires at 11 PM local still picks the right date but
// delivers the day's email late that evening. Drives the warning on
// /admin/scheduling. Client-safe.

import { CronExpressionParser } from 'cron-parser'

import { isValidTimeZone } from '@/lib/calendar-day'

import { cronRegistry } from './registry'

// Local hours outside [QUIET_END, QUIET_START) count as "late at night".
const QUIET_START = 18
const QUIET_END = 5

export type LateCronRun = {
	path: string
	label: string
	schedule: string
	// Next fire time in the deployment zone, e.g. "11:00 PM".
	localTime: string
}

export function lateDateSensitiveRuns(timeZone: string, now: Date = new Date()): Array<LateCronRun> {
	if (!isValidTimeZone(timeZone)) return []
	const hourFormat = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' })
	const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })

	const out: Array<LateCronRun> = []
	for (const entry of cronRegistry) {
		if (!('dateSensitive' in entry)) continue
		let next: Date
		try {
			// Registry schedules are UTC, like vercel.json and render.yaml.
			next = CronExpressionParser.parse(entry.schedule, { tz: 'UTC', currentDate: now }).next().toDate()
		} catch {
			continue
		}
		const hour = Number(hourFormat.format(next))
		if (hour >= QUIET_START || hour < QUIET_END) {
			out.push({ path: entry.path, label: entry.label, schedule: entry.schedule, localTime: timeFormat.format(next) })
		}
	}
	return out
}
