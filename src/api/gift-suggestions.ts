// Server-fn surface for the gifter-facing AI help on someone's list.
// Implementations live in `_gift-suggestions-impl.ts`.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { loggingMiddleware } from '@/lib/logger'
import { giftSuggestionsLimiter } from '@/lib/rate-limits'
import { authMiddleware } from '@/middleware/auth'

import {
	getGiftSuggestionsImpl,
	getListInterestsImpl,
	GiftSuggestionsInputSchema,
	type GiftSuggestionsResult,
	type ListInterests,
	saveGiftSuggestionImpl,
	SaveGiftSuggestionInputSchema,
	type SaveGiftSuggestionResult,
} from './_gift-suggestions-impl'

export type { GiftSuggestionsResult, ListInterests, SaveGiftSuggestionResult, SuggestedGift } from './_gift-suggestions-impl'

export const getGiftSuggestions = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof GiftSuggestionsInputSchema>) => GiftSuggestionsInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<GiftSuggestionsResult> => {
		const limit = giftSuggestionsLimiter.consume(`user:${context.session.user.id}`)
		if (!limit.allowed) return { kind: 'error', reason: 'rate-limited' }
		return getGiftSuggestionsImpl({
			actor: { id: context.session.user.id, isChild: context.session.user.isChild },
			input: data,
			now: new Date(),
		})
	})

export const saveGiftSuggestion = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof SaveGiftSuggestionInputSchema>) => SaveGiftSuggestionInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<SaveGiftSuggestionResult> =>
			saveGiftSuggestionImpl({ actor: { id: context.session.user.id, isChild: context.session.user.isChild }, input: data })
	)

const ListInterestsInputSchema = z.object({ listId: z.number().int().positive() })

export const getListInterests = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ListInterestsInputSchema>) => ListInterestsInputSchema.parse(data))
	.handler(({ context, data }): Promise<ListInterests> => getListInterestsImpl({ userId: context.session.user.id, listId: data.listId }))
