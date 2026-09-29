// Server-fn surface for gift ideas on a recipient's list. Implementations live
// in `_gift-ideas-impl.ts`; references to them only happen inside
// `.handler()` and `.inputValidator()` callbacks, which TanStack Start strips
// on the client.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

import {
	CopyGiftIdeaInputSchema,
	type CopyGiftIdeaResult,
	copyGiftIdeaToAddonImpl,
	getGiftIdeasForListImpl,
	type GetGiftIdeasForListResult,
} from './_gift-ideas-impl'

export type { CopyGiftIdeaResult, GetGiftIdeasForListResult, GiftIdeasSource } from './_gift-ideas-impl'

const GetGiftIdeasForListInputSchema = z.object({ listId: z.number().int().positive() })

export const getGiftIdeasForList = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof GetGiftIdeasForListInputSchema>) => GetGiftIdeasForListInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<GetGiftIdeasForListResult> =>
			getGiftIdeasForListImpl({ userId: context.session.user.id, listId: data.listId })
	)

export const copyGiftIdeaToAddon = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof CopyGiftIdeaInputSchema>) => CopyGiftIdeaInputSchema.parse(data))
	.handler(({ context, data }): Promise<CopyGiftIdeaResult> => copyGiftIdeaToAddonImpl({ userId: context.session.user.id, input: data }))
