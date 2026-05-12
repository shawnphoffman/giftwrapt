import { createCollection } from '@tanstack/db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { z } from 'zod'

import { getContext } from '@/integrations/tanstack-query/root-provider'

// Mirror of `HolidayWidgetRow` in src/api/_widgets-impl.ts. Kept as a
// runtime-checked Zod schema so the collection rejects payloads that
// drift out of sync with the server contract.
const HolidayWidgetRecipientSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('user'),
		id: z.string(),
		name: z.string().nullable(),
		image: z.string().nullable(),
	}),
	z.object({
		kind: z.literal('dependent'),
		id: z.string(),
		name: z.string(),
		image: z.string().nullable(),
	}),
])

const HolidayWidgetRowSchema = z.object({
	listId: z.number(),
	listName: z.string(),
	recipient: HolidayWidgetRecipientSchema,
	ownedByMe: z.boolean(),
	holidayCountry: z.string(),
	holidayKey: z.string(),
	holidayName: z.string(),
	occurrenceStart: z.string(),
	daysUntil: z.number(),
	lastGiftedAt: z.string().nullable(),
})

export type HolidayWidgetRecipient = z.infer<typeof HolidayWidgetRecipientSchema>
export type HolidayWidgetRow = z.infer<typeof HolidayWidgetRowSchema>

const getApiUrl = (path: string): string => {
	if (typeof window !== 'undefined') return path
	const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3002'
	return `${baseUrl}${path}`
}

export const upcomingHolidaysCollection = createCollection(
	queryCollectionOptions({
		queryKey: ['widgets', 'upcoming-holidays'],
		queryFn: async () => {
			const url = getApiUrl('/api/widgets/upcoming-holidays?horizonDays=60')
			const response = await fetch(url)
			if (!response.ok) {
				throw new Error('Failed to fetch upcoming holidays')
			}
			return response.json()
		},
		queryClient: getContext().queryClient,
		getKey: (row: HolidayWidgetRow) => row.listId,
		schema: HolidayWidgetRowSchema,
	})
)
