// Server-fn surface for items. All implementations live in
// `_items-impl.ts` (create/update/delete) and `_items-extra-impl.ts`
// (everything else). References to those impls only happen inside
// `.handler()` and `.inputValidator()` callbacks, which TanStack
// Start strips on the client. This keeps the server-only static
// import chain (db, drizzle ops, storage cleanup, etc.) out of the
// client bundle.

import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { db } from '@/db'
import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

import {
	archiveItemImpl,
	ArchiveItemInputSchema,
	type ArchiveItemResult,
	archiveItemsImpl,
	ArchiveItemsInputSchema,
	type ArchiveItemsResult,
	CopyItemInputSchema,
	type CopyItemResult,
	copyItemToListImpl,
	deleteGroupsImpl,
	DeleteGroupsInputSchema,
	type DeleteGroupsResult,
	deleteItemsImpl,
	DeleteItemsInputSchema,
	type DeleteItemsResult,
	getItemsForListEditImpl,
	type GetItemsForListEditResult,
	getItemsForListViewImpl,
	type GetItemsForListViewResult,
	MoveItemsInputSchema,
	type MoveItemsResult,
	moveItemsToListImpl,
	ReorderEntriesInputSchema,
	type ReorderEntriesResult,
	reorderItemsImpl,
	ReorderItemsInputSchema,
	type ReorderItemsResult,
	reorderListEntriesImpl,
	setGroupsPriorityImpl,
	SetGroupsPriorityInputSchema,
	type SetGroupsPriorityResult,
	setItemAvailabilityImpl,
	SetItemAvailabilityInputSchema,
	type SetItemAvailabilityResult,
	setItemsPriorityImpl,
	SetItemsPriorityInputSchema,
	type SetItemsPriorityResult,
	type SortOption,
} from './_items-extra-impl'
import {
	createItemImpl,
	CreateItemInputSchema,
	type CreateItemResult,
	deleteItemImpl,
	DeleteItemInputSchema,
	type DeleteItemResult,
	updateItemImpl,
	UpdateItemInputSchema,
	type UpdateItemResult,
} from './_items-impl'

export type {
	ArchiveItemResult,
	ArchiveItemsResult,
	CopyItemResult,
	DeleteGroupsResult,
	DeleteItemsResult,
	GetItemsForListEditResult,
	GetItemsForListViewResult,
	GiftOnItem,
	ItemForEditing,
	ItemWithGifts,
	MoveItemsResult,
	ReorderEntriesResult,
	ReorderItemsResult,
	SetGroupsPriorityResult,
	SetItemAvailabilityResult,
	SetItemsPriorityResult,
	SortOption,
} from './_items-extra-impl'
export type { CreateItemResult, DeleteItemResult, UpdateItemResult } from './_items-impl'

export const createItem = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof CreateItemInputSchema>) => CreateItemInputSchema.parse(data))
	.handler(({ context, data }): Promise<CreateItemResult> => createItemImpl({ db, actor: { id: context.session.user.id }, input: data }))

export const updateItem = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof UpdateItemInputSchema>) => UpdateItemInputSchema.parse(data))
	.handler(({ context, data }): Promise<UpdateItemResult> => updateItemImpl({ db, actor: { id: context.session.user.id }, input: data }))

export const deleteItem = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof DeleteItemInputSchema>) => DeleteItemInputSchema.parse(data))
	.handler(({ context, data }): Promise<DeleteItemResult> => deleteItemImpl({ db, actor: { id: context.session.user.id }, input: data }))

export const copyItemToList = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof CopyItemInputSchema>) => CopyItemInputSchema.parse(data))
	.handler(({ context, data }): Promise<CopyItemResult> => copyItemToListImpl({ userId: context.session.user.id, input: data }))

export const archiveItem = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ArchiveItemInputSchema>) => ArchiveItemInputSchema.parse(data))
	.handler(({ context, data }): Promise<ArchiveItemResult> => archiveItemImpl({ userId: context.session.user.id, input: data }))

export const setItemAvailability = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof SetItemAvailabilityInputSchema>) => SetItemAvailabilityInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<SetItemAvailabilityResult> => setItemAvailabilityImpl({ userId: context.session.user.id, input: data })
	)

export const moveItemsToList = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof MoveItemsInputSchema>) => MoveItemsInputSchema.parse(data))
	.handler(({ context, data }): Promise<MoveItemsResult> => moveItemsToListImpl({ userId: context.session.user.id, input: data }))

export const archiveItems = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ArchiveItemsInputSchema>) => ArchiveItemsInputSchema.parse(data))
	.handler(({ context, data }): Promise<ArchiveItemsResult> => archiveItemsImpl({ userId: context.session.user.id, input: data }))

export const deleteItems = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof DeleteItemsInputSchema>) => DeleteItemsInputSchema.parse(data))
	.handler(({ context, data }): Promise<DeleteItemsResult> => deleteItemsImpl({ userId: context.session.user.id, input: data }))

export const setItemsPriority = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof SetItemsPriorityInputSchema>) => SetItemsPriorityInputSchema.parse(data))
	.handler(({ context, data }): Promise<SetItemsPriorityResult> => setItemsPriorityImpl({ userId: context.session.user.id, input: data }))

export const reorderItems = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ReorderItemsInputSchema>) => ReorderItemsInputSchema.parse(data))
	.handler(({ context, data }): Promise<ReorderItemsResult> => reorderItemsImpl({ userId: context.session.user.id, input: data }))

export const reorderListEntries = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ReorderEntriesInputSchema>) => ReorderEntriesInputSchema.parse(data))
	.handler(({ context, data }): Promise<ReorderEntriesResult> => reorderListEntriesImpl({ userId: context.session.user.id, input: data }))

export const setGroupsPriority = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof SetGroupsPriorityInputSchema>) => SetGroupsPriorityInputSchema.parse(data))
	.handler(({ context, data }): Promise<SetGroupsPriorityResult> => setGroupsPriorityImpl({ userId: context.session.user.id, input: data }))

export const deleteGroups = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof DeleteGroupsInputSchema>) => DeleteGroupsInputSchema.parse(data))
	.handler(({ context, data }): Promise<DeleteGroupsResult> => deleteGroupsImpl({ userId: context.session.user.id, input: data }))

export const getItemsForListView = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: { listId: string; sort?: SortOption }) => ({
		listId: data.listId,
		sort: data.sort || ('priority-desc' as SortOption),
	}))
	.handler(
		({ context, data }): Promise<GetItemsForListViewResult> =>
			getItemsForListViewImpl({ userId: context.session.user.id, listId: data.listId, sort: data.sort })
	)

export const getItemsForListEdit = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: { listId: string; includeArchived?: boolean }) => ({
		listId: data.listId,
		includeArchived: data.includeArchived ?? false,
	}))
	.handler(
		({ context, data }): Promise<GetItemsForListEditResult> =>
			getItemsForListEditImpl({ userId: context.session.user.id, listId: data.listId, includeArchived: data.includeArchived })
	)
