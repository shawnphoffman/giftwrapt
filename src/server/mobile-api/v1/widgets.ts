// Widget data feeds for the iOS app. Currently exposes upcoming-holiday
// rows; the existing birthday widget reads from `/v1/lists/public` and
// computes its own countdowns.
//
//   GET /v1/widgets/upcoming-holidays?horizonDays=30

import type { Hono } from 'hono'

import { getUpcomingHolidaysImpl } from '@/api/_widgets-impl'

import type { MobileAuthContext } from '../auth'

type App = Hono<MobileAuthContext>

// Strip server-internal identifiers (country / key) from the wire shape.
// iOS only needs the human-readable holiday name to render; the country
// and slug are catalog primary keys with no UI use, and exposing them
// would couple the iOS client to internal data shapes.
function toMobileRow(row: Awaited<ReturnType<typeof getUpcomingHolidaysImpl>>[number]) {
	const { holidayCountry: _country, holidayKey: _key, ...rest } = row
	return rest
}

export function registerWidgetRoutes(v1: App): void {
	v1.get('/widgets/upcoming-holidays', async c => {
		const userId = c.get('userId')
		const horizonRaw = Number(c.req.query('horizonDays') ?? '30')
		const horizonDays = Number.isFinite(horizonRaw) ? Math.max(0, Math.min(366, Math.trunc(horizonRaw))) : 30
		const rows = await getUpcomingHolidaysImpl({ userId, horizonDays })
		return c.json({ rows: rows.map(toMobileRow), nextCursor: null })
	})
}
