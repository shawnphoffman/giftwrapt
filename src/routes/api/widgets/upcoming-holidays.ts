import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { getUpcomingHolidaysImpl } from '@/api/_widgets-impl'
import { auth } from '@/lib/auth'

// Holiday rows for the iOS Holidays widget and the parallel
// `upcomingHolidaysCollection` on the web. The default response is the
// next 3 closest holidays for the signed-in user, sourced from
// admin-curated `custom_holidays`, the hard-coded gift-giving holidays
// (Christmas, Valentine's, Mother's Day, Father's Day), and the user's
// `partnerAnniversary` when set. Callers can override `limit` (max 50)
// or narrow the lookahead with `horizonDays` (max 366).
export const Route = createFileRoute('/api/widgets/upcoming-holidays')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers })
				if (!session?.user.id) {
					throw new Error('Unauthorized')
				}
				const url = new URL(request.url)
				const limitRaw = Number(url.searchParams.get('limit') ?? '3')
				const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.trunc(limitRaw))) : 3
				const horizonRaw = url.searchParams.get('horizonDays')
				const horizonDays = horizonRaw == null ? undefined : Math.max(0, Math.min(366, Math.trunc(Number(horizonRaw))))
				const rows = await getUpcomingHolidaysImpl({ userId: session.user.id, limit, horizonDays })
				return json(rows)
			},
		},
	},
})
