// Server fns for the admin Reveals page. Thin wrappers over
// _admin-reveals-impl; admin-only, web-only.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
	getListsWithHiddenPurchasesImpl,
	type HiddenPurchasesListRow,
	revealListAsAdminImpl,
	type RevealListAsAdminResult,
} from '@/api/_admin-reveals-impl'
import { loggingMiddleware } from '@/lib/logger'
import { adminAuthMiddleware } from '@/middleware/auth'

export type { HiddenPurchasesListRow, RevealListAsAdminResult }

const RevealListAsAdminInputSchema = z.object({
	listId: z.number().int().positive(),
	sendEmail: z.boolean(),
})

export const getListsWithHiddenPurchasesAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.handler(({ context }): Promise<Array<HiddenPurchasesListRow>> => getListsWithHiddenPurchasesImpl({ adminId: context.session.user.id }))

export const revealListAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof RevealListAsAdminInputSchema>) => RevealListAsAdminInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<RevealListAsAdminResult> => revealListAsAdminImpl({ adminId: context.session.user.id, input: data })
	)
