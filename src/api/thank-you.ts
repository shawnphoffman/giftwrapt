// Server-fn surface for thank-you note drafts. The impl lives in
// `_thank-you-impl.ts`.

import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { loggingMiddleware } from '@/lib/logger'
import { thankYouDraftLimiter } from '@/lib/rate-limits'
import { authMiddleware } from '@/middleware/auth'

import { draftThankYouImpl, DraftThankYouInputSchema, type DraftThankYouResult } from './_thank-you-impl'

export type { DraftThankYouResult } from './_thank-you-impl'

export const draftThankYou = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof DraftThankYouInputSchema>) => DraftThankYouInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<DraftThankYouResult> => {
		const limit = thankYouDraftLimiter.consume(`user:${context.session.user.id}`)
		if (!limit.allowed) return { kind: 'error', reason: 'rate-limited' }
		return draftThankYouImpl({ actor: { id: context.session.user.id }, input: data })
	})
