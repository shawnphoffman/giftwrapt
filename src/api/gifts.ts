// Server-fn surface for gift / claim operations. Implementations live
// in `_gifts-impl.ts` so the static import chain into
// `@/routes/api/sse/list.$listId` -> `@/lib/auth` (which evaluates
// env at the top level) never reaches the client bundle. This file
// only references impls / schemas from inside `.handler()` and
// `.inputValidator()` callbacks, which TanStack Start strips on the
// client.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { loggingMiddleware } from '@/lib/logger'
import { claimLimiter } from '@/lib/rate-limits'
import { authMiddleware } from '@/middleware/auth'
import { rateLimit } from '@/middleware/rate-limit'

import {
	type AddableCoGifter,
	ClaimGiftInputSchema,
	type ClaimGiftResult,
	claimItemGiftImpl,
	getAddableCoGiftersImpl,
	UnclaimGiftInputSchema,
	type UnclaimGiftResult,
	unclaimItemGiftImpl,
	updateCoGiftersImpl,
	UpdateCoGiftersInputSchema,
	type UpdateCoGiftersResult,
	UpdateGiftInputSchema,
	type UpdateGiftResult,
	updateItemGiftImpl,
} from './_gifts-impl'

export type { AddableCoGifter, ClaimGiftResult, UnclaimGiftResult, UpdateCoGiftersResult, UpdateGiftResult } from './_gifts-impl'

export const claimItemGift = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, rateLimit(claimLimiter), loggingMiddleware])
	.inputValidator((data: z.input<typeof ClaimGiftInputSchema>) => ClaimGiftInputSchema.parse(data))
	.handler(({ context, data }): Promise<ClaimGiftResult> => claimItemGiftImpl({ gifterId: context.session.user.id, input: data }))

export const updateItemGift = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, rateLimit(claimLimiter), loggingMiddleware])
	.inputValidator((data: z.input<typeof UpdateGiftInputSchema>) => UpdateGiftInputSchema.parse(data))
	.handler(({ context, data }): Promise<UpdateGiftResult> => updateItemGiftImpl({ gifterId: context.session.user.id, input: data }))

export const unclaimItemGift = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, rateLimit(claimLimiter), loggingMiddleware])
	.inputValidator((data: z.input<typeof UnclaimGiftInputSchema>) => UnclaimGiftInputSchema.parse(data))
	.handler(({ context, data }): Promise<UnclaimGiftResult> => unclaimItemGiftImpl({ gifterId: context.session.user.id, input: data }))

export const updateCoGifters = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof UpdateCoGiftersInputSchema>) => UpdateCoGiftersInputSchema.parse(data))
	.handler(({ context, data }): Promise<UpdateCoGiftersResult> => updateCoGiftersImpl({ gifterId: context.session.user.id, input: data }))

export const getAddableCoGifters = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: { giftId: number }) => z.object({ giftId: z.number().int().positive() }).parse(data))
	.handler(
		({ context, data }): Promise<Array<AddableCoGifter>> =>
			getAddableCoGiftersImpl({ callerId: context.session.user.id, giftId: data.giftId })
	)
