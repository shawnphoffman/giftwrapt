// Server-fn surface for user relationships. All implementations live
// in `_permissions-impl.ts`. References to those impls only happen
// inside `.handler()` callbacks, which TanStack Start strips on the
// client.

import { createServerFn } from '@tanstack/react-start'

import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

import {
	getOwnersWithRelationshipsForMeImpl,
	getUsersWithRelationshipsImpl,
	upsertUserRelationshipsImpl,
	type UpsertUserRelationshipsInput,
	upsertViewerRelationshipsImpl,
	type UpsertViewerRelationshipsInput,
} from './_permissions-impl'

export type { RelationshipRow, UpsertUserRelationshipsInput, UpsertViewerRelationshipsInput } from './_permissions-impl'

export const getUsersWithRelationships = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(({ context }) => getUsersWithRelationshipsImpl(context.session.user.id))

export const getOwnersWithRelationshipsForMe = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(({ context }) => getOwnersWithRelationshipsForMeImpl(context.session.user.id))

export const upsertUserRelationships = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: UpsertUserRelationshipsInput) => data)
	.handler(({ context, data }) => upsertUserRelationshipsImpl({ ownerUserId: context.session.user.id, input: data }))

export const upsertViewerRelationships = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: UpsertViewerRelationshipsInput) => data)
	.handler(({ context, data }) => upsertViewerRelationshipsImpl({ viewerUserId: context.session.user.id, input: data }))
