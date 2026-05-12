// Widget data feeds for the iOS app. Currently exposes upcoming-holiday
// rows; the existing birthday widget reads from `/v1/lists/public` and
// computes its own countdowns.
//
//   GET /v1/widgets/upcoming-holidays?limit=3
//
// The wire shape is shared with the web db-collection
// (`upcomingHolidaysCollection`) so iOS and the web widget surface read
// the same payload byte-for-byte. Each row is a holiday, not a list:
// admin-curated `custom_holidays` plus the hardcoded gift-giving
// holidays (Christmas, Valentine's, Mother's Day, Father's Day) plus
// the signed-in user's anniversary when set. The server returns the
// closest `limit` holidays sorted by `daysUntil` (default 3).

import type { Hono } from 'hono'

import { getUpcomingHolidaysImpl } from '@/api/_widgets-impl'

import type { MobileAuthContext } from '../auth'

type App = Hono<MobileAuthContext>

export function registerWidgetRoutes(v1: App): void {
	v1.get('/widgets/upcoming-holidays', async c => {
		const userId = c.get('userId')
		const limitRaw = Number(c.req.query('limit') ?? '3')
		const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.trunc(limitRaw))) : 3
		const rows = await getUpcomingHolidaysImpl({ userId, limit })
		return c.json({ rows, nextCursor: null })
	})
}
