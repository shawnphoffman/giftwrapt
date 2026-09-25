import { describe, expect, it } from 'vitest'

import { lateDateSensitiveRuns } from '../schedule-zone'

// A fixed summer date so DST is known (LA = UTC-7, London = UTC+1).
const NOW = new Date('2026-07-01T00:00:00Z')

describe('lateDateSensitiveRuns', () => {
	it('does not warn where the defaults land in the daytime', () => {
		expect(lateDateSensitiveRuns('UTC', NOW)).toEqual([])
		expect(lateDateSensitiveRuns('America/Los_Angeles', NOW)).toEqual([])
		expect(lateDateSensitiveRuns('America/New_York', NOW)).toEqual([])
		expect(lateDateSensitiveRuns('Europe/London', NOW)).toEqual([])
	})

	it('warns for each date-sensitive job that lands late at night', () => {
		// 14:00 / 15:00 UTC is 11 PM / midnight in Tokyo.
		const late = lateDateSensitiveRuns('Asia/Tokyo', NOW)
		expect(late.map(r => r.path)).toEqual(['/api/cron/auto-archive', '/api/cron/birthday-emails'])
		expect(late.map(r => r.localTime)).toEqual(['11:00 PM', '12:00 AM'])
	})

	it('ignores jobs that are not date-sensitive', () => {
		// cleanup-verification (03:00 UTC) is 8 PM in LA but only prunes rows.
		expect(lateDateSensitiveRuns('America/Los_Angeles', NOW).some(r => r.path === '/api/cron/cleanup-verification')).toBe(false)
	})

	it('returns nothing for an invalid zone', () => {
		expect(lateDateSensitiveRuns('Not/AZone', NOW)).toEqual([])
	})
})
