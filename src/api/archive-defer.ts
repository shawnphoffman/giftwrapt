// Server fns for the list reveal-timing controls (edit view): force-reveal,
// set/extend the archive deferral, cancel it. Thin wrappers over
// _archive-defer-impl; web-only (no mobile-api parity by design).

import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { cancelArchiveDeferImpl, forceArchiveListImpl, setArchiveDeferImpl } from '@/api/_archive-defer-impl'
import {
	CancelArchiveDeferInputSchema,
	type CancelArchiveDeferResult,
	ForceArchiveListInputSchema,
	type ForceArchiveListResult,
	SetArchiveDeferInputSchema,
	type SetArchiveDeferResult,
} from '@/api/_archive-defer-schemas'
import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

export const forceArchiveList = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ForceArchiveListInputSchema>) => ForceArchiveListInputSchema.parse(data))
	.handler(({ context, data }): Promise<ForceArchiveListResult> => forceArchiveListImpl({ userId: context.session.user.id, input: data }))

export const setArchiveDefer = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof SetArchiveDeferInputSchema>) => SetArchiveDeferInputSchema.parse(data))
	.handler(({ context, data }): Promise<SetArchiveDeferResult> => setArchiveDeferImpl({ userId: context.session.user.id, input: data }))

export const cancelArchiveDefer = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof CancelArchiveDeferInputSchema>) => CancelArchiveDeferInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<CancelArchiveDeferResult> => cancelArchiveDeferImpl({ userId: context.session.user.id, input: data })
	)
