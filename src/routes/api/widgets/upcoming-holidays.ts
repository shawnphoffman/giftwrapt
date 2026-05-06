import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { getUpcomingHolidaysImpl } from '@/api/_widgets-impl'
import { auth } from '@/lib/auth'

// Holiday-list rows for the iOS-mirror widgets surface and the parallel
// `upcomingHolidaysCollection` on the web. Returns one row per
// holiday-typed list the viewer can see whose next occurrence falls
// inside the requested horizon (default 30 days).
export const Route = createFileRoute('/api/widgets/upcoming-holidays')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers })
				if (!session?.user.id) {
					throw new Error('Unauthorized')
				}
				const url = new URL(request.url)
				const horizonRaw = Number(url.searchParams.get('horizonDays') ?? '30')
				const horizonDays = Number.isFinite(horizonRaw) ? Math.max(0, Math.min(366, Math.trunc(horizonRaw))) : 30
				const rows = await getUpcomingHolidaysImpl({ userId: session.user.id, horizonDays })
				return json(rows)
			},
		},
	},
})
