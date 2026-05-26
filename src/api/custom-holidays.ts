// Server-fn surface for the custom_holidays admin UI and the new-list
// picker. Implementations live in `_custom-holidays-impl.ts`.

import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { loggingMiddleware } from '@/lib/logger'
import { adminAuthMiddleware, authMiddleware } from '@/middleware/auth'

import {
	addCatalogCustomHolidayImpl,
	AddCatalogCustomHolidayInputSchema,
	addCustomCustomHolidayImpl,
	AddCustomCustomHolidayInputSchema,
	type AddCustomHolidayResult,
	type AdminCustomHoliday,
	type CatalogCandidate,
	type CustomHolidayForPicker,
	deleteCustomHolidayImpl,
	DeleteCustomHolidayInputSchema,
	type DeleteCustomHolidayResult,
	listCatalogCandidatesImpl,
	listCustomHolidaysForPickerImpl,
	listCustomHolidaysImpl,
	listRecipientCandidatesImpl,
	type RecipientCandidate,
	updateCustomHolidayImpl,
	UpdateCustomHolidayInputSchema,
	type UpdateCustomHolidayResult,
} from './_custom-holidays-impl'

export type {
	AddCustomHolidayResult,
	AdminCustomHoliday,
	CatalogCandidate,
	CustomHolidayForPicker,
	DeleteCustomHolidayResult,
	RecipientCandidate,
	UpdateCustomHolidayResult,
}

// Admin: full list with usage counts.
export const listCustomHolidaysAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.handler((): Promise<Array<AdminCustomHoliday>> => listCustomHolidaysImpl())

// Admin: catalog candidates available to add across all countries.
export const listCatalogCandidatesAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.handler((): Promise<Array<CatalogCandidate>> => listCatalogCandidatesImpl())

// Admin: candidates for the "who is this holiday for?" picker.
export const listRecipientCandidatesAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.handler((): Promise<Array<RecipientCandidate>> => listRecipientCandidatesImpl())

export const addCatalogCustomHolidayAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof AddCatalogCustomHolidayInputSchema>) => AddCatalogCustomHolidayInputSchema.parse(data))
	.handler(({ data }) => addCatalogCustomHolidayImpl({ input: data }))

export const addCustomCustomHolidayAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof AddCustomCustomHolidayInputSchema>) => AddCustomCustomHolidayInputSchema.parse(data))
	.handler(({ data }) => addCustomCustomHolidayImpl({ input: data }))

export const updateCustomHolidayAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof UpdateCustomHolidayInputSchema>) => UpdateCustomHolidayInputSchema.parse(data))
	.handler(({ data }) => updateCustomHolidayImpl({ input: data }))

export const deleteCustomHolidayAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof DeleteCustomHolidayInputSchema>) => DeleteCustomHolidayInputSchema.parse(data))
	.handler(({ data }) => deleteCustomHolidayImpl({ input: data }))

// Public picker read. Any signed-in user. Used by the new-list dialog.
// Gated by viewer visibility on the recipient: broadcast rows are
// universal; recipient-bound rows only surface to viewers who can see
// the recipient (same gate as the widget / reminder cron).
export const listCustomHolidaysForPicker = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(({ context }): Promise<Array<CustomHolidayForPicker>> => listCustomHolidaysForPickerImpl({ viewerId: context.session.user.id }))
