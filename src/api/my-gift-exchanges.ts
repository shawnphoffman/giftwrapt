// Server-fn surface for everyone's Gift Exchange page (plan 39, slice 39d).
// Any signed-in user; each function acts only on the caller's own
// memberships, or their own children's. Implementations live in
// `_my-gift-exchanges-impl.ts`.

import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

import { ExchangeIdInputSchema, RevealChildAssignmentInputSchema } from './_gift-exchanges-schemas'
import {
	type ExchangeRecipientRef,
	getMyExchangeCountImpl,
	getMyExchangesImpl,
	type MyChildExchange,
	type MyExchange,
	type MyExchangeRecipient,
	type MyExchangesPayload,
	type MyExchangeState,
	revealChildAssignmentImpl,
	type RevealChildAssignmentResult,
	revealMyAssignmentImpl,
	type RevealMyAssignmentResult,
} from './_my-gift-exchanges-impl'

export type {
	ExchangeRecipientRef,
	MyChildExchange,
	MyExchange,
	MyExchangeRecipient,
	MyExchangesPayload,
	MyExchangeState,
	RevealChildAssignmentResult,
	RevealMyAssignmentResult,
}

/** The Gift Exchange page. Reading it never counts as looking. */
export const getMyGiftExchanges = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(({ context }): Promise<MyExchangesPayload> => getMyExchangesImpl({ userId: context.session.user.id }))

/** For the sidebar: above zero when the Gift Exchange page has something on it. */
export const getMyGiftExchangeCount = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.handler(({ context }): Promise<{ count: number }> => getMyExchangeCountImpl({ userId: context.session.user.id }))

/** See Who You Have: records that the caller looked, and returns who they gift to. */
export const revealMyGiftExchangeAssignment = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ExchangeIdInputSchema>) => ExchangeIdInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<RevealMyAssignmentResult> =>
			revealMyAssignmentImpl({ userId: context.session.user.id, exchangeId: data.exchangeId })
	)

/** A guardian's Show: who one of their children gifts to. */
export const revealChildGiftExchangeAssignment = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof RevealChildAssignmentInputSchema>) => RevealChildAssignmentInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<RevealChildAssignmentResult> =>
			revealChildAssignmentImpl({ userId: context.session.user.id, exchangeId: data.exchangeId, childUserId: data.childUserId })
	)
