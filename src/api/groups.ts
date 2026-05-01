// Server-fn surface for item groups. All implementations live in
// `_groups-impl.ts` so the static import chain (db, drizzle ops,
// permissions helper) only loads on the server. References to those
// impls from this file sit inside `.handler()` and `.inputValidator()`
// callbacks, which TanStack Start strips on the client.

import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

import {
	AssignItemsInputSchema,
	type AssignItemsResult,
	assignItemsToGroupImpl,
	CreateGroupInputSchema,
	type CreateGroupResult,
	createItemGroupImpl,
	DeleteGroupInputSchema,
	type DeleteGroupResult,
	deleteItemGroupImpl,
	getGroupsForListImpl,
	type GroupWithItems,
	MoveGroupInputSchema,
	type MoveGroupResult,
	moveGroupToListImpl,
	reorderGroupItemsImpl,
	ReorderGroupItemsInputSchema,
	type ReorderResult,
	UpdateGroupInputSchema,
	type UpdateGroupResult,
	updateItemGroupImpl,
} from './_groups-impl'

export type {
	AssignItemsResult,
	CreateGroupResult,
	DeleteGroupResult,
	GroupWithItems,
	MoveGroupResult,
	ReorderResult,
	UpdateGroupResult,
} from './_groups-impl'

export const createItemGroup = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof CreateGroupInputSchema>) => CreateGroupInputSchema.parse(data))
	.handler(({ context, data }): Promise<CreateGroupResult> => createItemGroupImpl({ userId: context.session.user.id, input: data }))

export const updateItemGroup = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof UpdateGroupInputSchema>) => UpdateGroupInputSchema.parse(data))
	.handler(({ context, data }): Promise<UpdateGroupResult> => updateItemGroupImpl({ userId: context.session.user.id, input: data }))

export const deleteItemGroup = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof DeleteGroupInputSchema>) => DeleteGroupInputSchema.parse(data))
	.handler(({ context, data }): Promise<DeleteGroupResult> => deleteItemGroupImpl({ userId: context.session.user.id, input: data }))

export const moveGroupToList = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof MoveGroupInputSchema>) => MoveGroupInputSchema.parse(data))
	.handler(({ context, data }): Promise<MoveGroupResult> => moveGroupToListImpl({ userId: context.session.user.id, input: data }))

export const assignItemsToGroup = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof AssignItemsInputSchema>) => AssignItemsInputSchema.parse(data))
	.handler(({ context, data }): Promise<AssignItemsResult> => assignItemsToGroupImpl({ userId: context.session.user.id, input: data }))

export const reorderGroupItems = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ReorderGroupItemsInputSchema>) => ReorderGroupItemsInputSchema.parse(data))
	.handler(({ context, data }): Promise<ReorderResult> => reorderGroupItemsImpl({ userId: context.session.user.id, input: data }))

export const getGroupsForList = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: { listId: number }) => ({ listId: data.listId }))
	.handler(({ data }): Promise<Array<GroupWithItems>> => getGroupsForListImpl({ listId: data.listId }))
