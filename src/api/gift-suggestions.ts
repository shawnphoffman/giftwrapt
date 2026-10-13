// Server-fn surface for the gifter-facing AI help on someone's list.
// Implementations live in `_gift-suggestions-impl.ts`.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { loggingMiddleware } from '@/lib/logger'
import { giftSuggestionsLimiter } from '@/lib/rate-limits'
import { authMiddleware } from '@/middleware/auth'

import {
	clearGiftSuggestionFeedbackImpl,
	ClearGiftSuggestionFeedbackInputSchema,
	getGiftSuggestionsImpl,
	getLatestGiftSuggestionSetImpl,
	getListInterestsImpl,
	GiftSuggestionFeedbackInputSchema,
	type GiftSuggestionFeedbackResult,
	GiftSuggestionsInputSchema,
	type GiftSuggestionsResult,
	LatestGiftSuggestionSetInputSchema,
	type LatestGiftSuggestionSetResult,
	type ListInterests,
	saveGiftSuggestionImpl,
	SaveGiftSuggestionInputSchema,
	type SaveGiftSuggestionResult,
	setGiftSuggestionFeedbackImpl,
} from './_gift-suggestions-impl'

export type {
	GiftSuggestionFeedbackResult,
	GiftSuggestionsResult,
	LatestGiftSuggestionSet,
	LatestGiftSuggestionSetResult,
	ListInterests,
	SaveGiftSuggestionResult,
	StoredSuggestionSetMeta,
	SuggestedGift,
	SuggestionVerdict,
} from './_gift-suggestions-impl'

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

// The stored answer, free to read: no model call, so no limiter.
export const getLatestGiftSuggestionSet = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof LatestGiftSuggestionSetInputSchema>) => LatestGiftSuggestionSetInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<LatestGiftSuggestionSetResult> =>
			getLatestGiftSuggestionSetImpl({ actor: { id: context.session.user.id, isChild: context.session.user.isChild }, input: data })
	)

export const saveGiftSuggestion = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof SaveGiftSuggestionInputSchema>) => SaveGiftSuggestionInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<SaveGiftSuggestionResult> =>
			saveGiftSuggestionImpl({ actor: { id: context.session.user.id, isChild: context.session.user.isChild }, input: data })
	)

export const setGiftSuggestionFeedback = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof GiftSuggestionFeedbackInputSchema>) => GiftSuggestionFeedbackInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<GiftSuggestionFeedbackResult> =>
			setGiftSuggestionFeedbackImpl({
				actor: { id: context.session.user.id, isChild: context.session.user.isChild },
				input: data,
				now: new Date(),
			})
	)

export const clearGiftSuggestionFeedback = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ClearGiftSuggestionFeedbackInputSchema>) => ClearGiftSuggestionFeedbackInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<GiftSuggestionFeedbackResult> =>
			clearGiftSuggestionFeedbackImpl({ actor: { id: context.session.user.id, isChild: context.session.user.isChild }, input: data })
	)

const ListInterestsInputSchema = z.object({ listId: z.number().int().positive() })

export const getListInterests = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ListInterestsInputSchema>) => ListInterestsInputSchema.parse(data))
	.handler(({ context, data }): Promise<ListInterests> => getListInterestsImpl({ userId: context.session.user.id, listId: data.listId }))
