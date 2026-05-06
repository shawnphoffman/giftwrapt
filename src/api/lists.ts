// Server-fn surface for lists. All implementations live in
// `_lists-impl.ts` so the static import chain (db, permissions,
// gifts helpers) only loads on the server. References to those impls
// from this file sit inside `.handler()` and `.inputValidator()`
// callbacks, which TanStack Start strips on the client.

import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { db } from '@/db'
import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

import {
	createListImpl,
	CreateListInputSchema,
	type CreateListResult,
	deleteListImpl,
	getListForEditingImpl,
	type GetListForEditingResult,
	getListForViewingImpl,
	type GetListForViewingResult,
	getListSummariesImpl,
	GetListSummariesInputSchema,
	getMyLastHolidayCountryImpl,
	getMyListsImpl,
	getPublicDependentsImpl,
	type ListSummary,
	type MyListsResult,
	type PublicDependent,
	setPrimaryListImpl,
	SetPrimaryListInputSchema,
	type SetPrimaryListResult,
	updateListImpl,
	UpdateListInputSchema,
	type UpdateListResult,
} from './_lists-impl'

// Re-export public types so existing imports of `@/api/lists` keep working.
export type {
	AddonOnList,
	ChildListGroup,
	CreateListResult,
	DeleteListResult,
	DependentListGroup,
	GetListForEditingResult,
	GetListForViewingResult,
	GroupSummary,
	ListForEditing,
	ListForViewing,
	ListForViewingSubjectDependent,
	ListSummary,
	MyListRow,
	MyListsResult,
	PublicDependent,
	PublicList,
	PublicListType,
	PublicUser,
	SetPrimaryListResult,
	UpdateListResult,
} from './_lists-impl'
export type { GiftOnItem, ItemForEditing, ItemWithGifts, SortOption } from '@/api/items'

export const getListForViewing = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: { listId: string }) => ({ listId: data.listId }))
	.handler(
		({ context, data }): Promise<GetListForViewingResult> => getListForViewingImpl({ userId: context.session.user.id, listId: data.listId })
	)

export const getListSummaries = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof GetListSummariesInputSchema>) => GetListSummariesInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<{ summaries: Array<ListSummary> }> =>
			getListSummariesImpl({ userId: context.session.user.id, input: data })
	)

export const getMyLists = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(({ context }): Promise<MyListsResult> => getMyListsImpl(context.session.user.id))

export const getMyLastHolidayCountry = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(({ context }): Promise<string | null> => getMyLastHolidayCountryImpl({ userId: context.session.user.id }))

// Public-feed dependents (pets, babies, etc. with at least one public list).
// Mirrors the user-side `/api/lists/public` shape but groups by dependent
// rather than by user.
export const getPublicDependents = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(({ context }): Promise<Array<PublicDependent>> => getPublicDependentsImpl(context.session.user.id))

export const createList = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof CreateListInputSchema>) => CreateListInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<CreateListResult> =>
			createListImpl({ actor: { id: context.session.user.id, isChild: context.session.user.isChild }, input: data })
	)

export const updateList = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof UpdateListInputSchema>) => UpdateListInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<UpdateListResult> =>
			updateListImpl({ actor: { id: context.session.user.id, isChild: context.session.user.isChild }, input: data })
	)

export const deleteList = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: { listId: number }) => ({ listId: data.listId }))
	.handler(({ context, data }) =>
		deleteListImpl({
			db,
			actor: { id: context.session.user.id },
			input: data,
		})
	)

export const setPrimaryList = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof SetPrimaryListInputSchema>) => SetPrimaryListInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<SetPrimaryListResult> => setPrimaryListImpl({ actor: { id: context.session.user.id }, input: data })
	)

export const getListForEditing = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: { listId: string }) => ({ listId: data.listId }))
	.handler(
		({ context, data }): Promise<GetListForEditingResult> => getListForEditingImpl({ userId: context.session.user.id, listId: data.listId })
	)
