// Server-fn surface for item categories. All implementations live in
// `_categories-impl.ts` so the static import chain (db, drizzle ops,
// permissions helper) only loads on the server. References to those impls
// from this file sit inside `.handler()` and `.inputValidator()` callbacks,
// which TanStack Start strips on the client.

import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { loggingMiddleware } from '@/lib/logger'
import { categorySuggestionsLimiter } from '@/lib/rate-limits'
import { authMiddleware } from '@/middleware/auth'

import {
	assignCategoryImpl,
	AssignCategoryInputSchema,
	type AssignCategoryResult,
	CategoryNameSuggestionsInputSchema,
	type CategoryNameSuggestionsResult,
	createCategoryImpl,
	CreateCategoryInputSchema,
	type CreateCategoryResult,
	deleteCategoryImpl,
	DeleteCategoryInputSchema,
	type DeleteCategoryResult,
	getCategoryNameSuggestionsImpl,
	getListCategoriesImpl,
	ListCategoriesInputSchema,
	type ListCategoriesResult,
	reorderCategoriesImpl,
	ReorderCategoriesInputSchema,
	type ReorderCategoriesResult,
	updateCategoryImpl,
	UpdateCategoryInputSchema,
	type UpdateCategoryResult,
} from './_categories-impl'
import {
	applyCategorySuggestionsImpl,
	ApplyCategorySuggestionsInputSchema,
	type ApplyCategorySuggestionsResult,
	suggestCategoriesImpl,
	SuggestCategoriesInputSchema,
	type SuggestCategoriesResult,
} from './_category-suggestions-impl'

export type {
	AssignCategoryResult,
	CategoryNameSuggestionsResult,
	CreateCategoryResult,
	DeleteCategoryResult,
	ListCategoriesResult,
	ReorderCategoriesResult,
	UpdateCategoryResult,
} from './_categories-impl'
export type { ApplyCategorySuggestionsResult, CategorySuggestion, SuggestCategoriesResult } from './_category-suggestions-impl'

export const createCategory = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof CreateCategoryInputSchema>) => CreateCategoryInputSchema.parse(data))
	.handler(({ context, data }): Promise<CreateCategoryResult> => createCategoryImpl({ userId: context.session.user.id, input: data }))

export const updateCategory = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof UpdateCategoryInputSchema>) => UpdateCategoryInputSchema.parse(data))
	.handler(({ context, data }): Promise<UpdateCategoryResult> => updateCategoryImpl({ userId: context.session.user.id, input: data }))

export const reorderCategories = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ReorderCategoriesInputSchema>) => ReorderCategoriesInputSchema.parse(data))
	.handler(({ context, data }): Promise<ReorderCategoriesResult> => reorderCategoriesImpl({ userId: context.session.user.id, input: data }))

export const deleteCategory = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof DeleteCategoryInputSchema>) => DeleteCategoryInputSchema.parse(data))
	.handler(({ context, data }): Promise<DeleteCategoryResult> => deleteCategoryImpl({ userId: context.session.user.id, input: data }))

export const assignCategory = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof AssignCategoryInputSchema>) => AssignCategoryInputSchema.parse(data))
	.handler(({ context, data }): Promise<AssignCategoryResult> => assignCategoryImpl({ userId: context.session.user.id, input: data }))

export const getCategoryNameSuggestions = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof CategoryNameSuggestionsInputSchema>) => CategoryNameSuggestionsInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<CategoryNameSuggestionsResult> =>
			getCategoryNameSuggestionsImpl({ userId: context.session.user.id, input: data })
	)

export const getListCategories = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ListCategoriesInputSchema>) => ListCategoriesInputSchema.parse(data))
	.handler(({ context, data }): Promise<ListCategoriesResult> => getListCategoriesImpl({ userId: context.session.user.id, input: data }))

// One model call per press. The limit is checked here, before the impl, so
// a refused press costs nothing.
export const suggestCategories = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof SuggestCategoriesInputSchema>) => SuggestCategoriesInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<SuggestCategoriesResult> => {
		const limit = categorySuggestionsLimiter.consume(`user:${context.session.user.id}`)
		if (!limit.allowed) return { kind: 'error', reason: 'rate-limited' }
		return suggestCategoriesImpl({ actor: { id: context.session.user.id, isChild: context.session.user.isChild }, input: data })
	})

export const applyCategorySuggestions = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ApplyCategorySuggestionsInputSchema>) => ApplyCategorySuggestionsInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<ApplyCategorySuggestionsResult> =>
			applyCategorySuggestionsImpl({ userId: context.session.user.id, input: data })
	)
