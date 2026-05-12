// Server-fn surface for widget data. Implementations live in
// `_widgets-impl.ts` so the static import chain (db, permissions,
// holidays helpers) only loads on the server.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

import { getUpcomingHolidaysImpl, type UpcomingHolidayRow } from './_widgets-impl'

export type { UpcomingHolidayRow, UpcomingHolidaySource } from './_widgets-impl'

const GetUpcomingHolidaysInputSchema = z.object({
	limit: z.number().int().min(1).max(50).default(3),
	horizonDays: z.number().int().min(0).max(366).optional(),
})

export const getUpcomingHolidays = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof GetUpcomingHolidaysInputSchema>) => GetUpcomingHolidaysInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<Array<UpcomingHolidayRow>> =>
			getUpcomingHolidaysImpl({ userId: context.session.user.id, limit: data.limit, horizonDays: data.horizonDays })
	)
