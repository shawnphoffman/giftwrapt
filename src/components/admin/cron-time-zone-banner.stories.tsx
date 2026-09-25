import type { Meta, StoryObj } from '@storybook/react-vite'

import { lateDateSensitiveRuns } from '@/lib/cron/schedule-zone'

import { CronTimeZoneWarning } from './cron-time-zone-banner'

/**
 * Shown on /admin/scheduling when a date-sensitive job's default schedule
 * lands late at night in the deployment time zone. Renders nothing when
 * the defaults fall in the daytime (UTC, the Americas, Europe).
 */
const meta = {
	title: 'Admin/Cron Time Zone Warning',
	component: CronTimeZoneWarning,
	parameters: { layout: 'padded' },
} satisfies Meta<typeof CronTimeZoneWarning>

export default meta
type Story = StoryObj<typeof meta>

const SUMMER = new Date('2026-07-01T00:00:00Z')

export const Tokyo: Story = {
	args: { timeZone: 'Asia/Tokyo', late: lateDateSensitiveRuns('Asia/Tokyo', SUMMER) },
}

export const LosAngelesNoWarning: Story = {
	args: { timeZone: 'America/Los_Angeles', late: lateDateSensitiveRuns('America/Los_Angeles', SUMMER) },
}
