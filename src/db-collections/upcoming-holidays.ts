import { createCollection } from '@tanstack/db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { z } from 'zod'

import { getContext } from '@/integrations/tanstack-query/root-provider'

// Mirror of `UpcomingHolidayRow` in src/api/_widgets-impl.ts. Each row is
// a single holiday (admin-curated or hardcoded reminder family), not a
// specific list — the widget is a "what's coming up" surface, not a
// list dashboard.
const UpcomingHolidayRowSchema = z.object({
	id: z.string(),
	source: z.enum(['custom', 'christmas', 'mothers-day', 'fathers-day', 'valentines', 'anniversary']),
	title: z.string(),
	occurrenceStart: z.string(),
	daysUntil: z.number(),
})

export type UpcomingHolidayRow = z.infer<typeof UpcomingHolidayRowSchema>

const getApiUrl = (path: string): string => {
	if (typeof window !== 'undefined') return path
	const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3002'
	return `${baseUrl}${path}`
}

export const upcomingHolidaysCollection = createCollection(
	queryCollectionOptions({
		queryKey: ['widgets', 'upcoming-holidays'],
		queryFn: async () => {
			// Debug surface wants every candidate the server would consider,
			// not just the top 3. iOS uses the default limit (3) directly.
			const url = getApiUrl('/api/widgets/upcoming-holidays?limit=50')
			const response = await fetch(url)
			if (!response.ok) {
				throw new Error('Failed to fetch upcoming holidays')
			}
			return response.json()
		},
		queryClient: getContext().queryClient,
		getKey: (row: UpcomingHolidayRow) => row.id,
		schema: UpcomingHolidayRowSchema,
	})
)
