// Server-fn surface for widget data. Implementations live in
// `_widgets-impl.ts` so the static import chain (db, permissions,
// holidays helpers) only loads on the server.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

import { getUpcomingHolidaysImpl, type HolidayWidgetRow } from './_widgets-impl'

export type { HolidayWidgetRecipient, HolidayWidgetRow } from './_widgets-impl'

const GetUpcomingHolidaysInputSchema = z.object({
	horizonDays: z.number().int().min(0).max(366).default(30),
	limit: z.number().int().min(1).max(200).optional(),
})

export const getUpcomingHolidays = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof GetUpcomingHolidaysInputSchema>) => GetUpcomingHolidaysInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<Array<HolidayWidgetRow>> =>
			getUpcomingHolidaysImpl({ userId: context.session.user.id, horizonDays: data.horizonDays, limit: data.limit })
	)
