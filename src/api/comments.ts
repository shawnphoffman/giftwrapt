// Server-fn surface for item comments. All implementations live in
// `_comments-impl.ts` so the client bundle never sees the static
// import chain into `@/lib/resend` (top-level env access) or
// `@/lib/settings-loader` -> `@/lib/crypto/app-secret` ->
// `node:crypto`. This file only references the impls and schemas
// from inside `.handler()` and `.inputValidator()` callbacks, which
// TanStack Start strips on the client.

import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { loggingMiddleware } from '@/lib/logger'
import { commentLimiter } from '@/lib/rate-limits'
import { authMiddleware } from '@/middleware/auth'
import { rateLimit } from '@/middleware/rate-limit'

import {
	type CommentWithUser,
	CreateCommentInputSchema,
	type CreateCommentResult,
	createItemCommentImpl,
	DeleteCommentInputSchema,
	type DeleteCommentResult,
	deleteItemCommentImpl,
	getCommentsForItemImpl,
	UpdateCommentInputSchema,
	type UpdateCommentResult,
	updateItemCommentImpl,
} from './_comments-impl'

export type { CommentWithUser, CreateCommentResult, DeleteCommentResult, UpdateCommentResult } from './_comments-impl'

export const getCommentsForItem = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: { itemId: number }) => ({ itemId: data.itemId }))
	.handler(
		({ context, data }): Promise<Array<CommentWithUser>> => getCommentsForItemImpl({ userId: context.session.user.id, itemId: data.itemId })
	)

export const createItemComment = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, rateLimit(commentLimiter), loggingMiddleware])
	.inputValidator((data: z.input<typeof CreateCommentInputSchema>) => CreateCommentInputSchema.parse(data))
	.handler(({ context, data }): Promise<CreateCommentResult> => createItemCommentImpl({ userId: context.session.user.id, input: data }))

export const updateItemComment = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof UpdateCommentInputSchema>) => UpdateCommentInputSchema.parse(data))
	.handler(({ context, data }): Promise<UpdateCommentResult> => updateItemCommentImpl({ userId: context.session.user.id, input: data }))

export const deleteItemComment = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof DeleteCommentInputSchema>) => DeleteCommentInputSchema.parse(data))
	.handler(({ context, data }): Promise<DeleteCommentResult> => deleteItemCommentImpl({ userId: context.session.user.id, input: data }))
