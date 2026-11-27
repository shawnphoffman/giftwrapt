// Server-only impls for Suggest Categories (plan 42, slice 42c): one model
// call that proposes categories for the items on a list that have none, and
// the write that applies what the person confirmed.
//
// The suggestion writes nothing and stores nothing. It is owner-facing, so
// it follows the Intelligence rule: no claim data reaches the prompt at
// all. Only titles go out (see src/lib/category-suggestions/prompt.ts and
// the 'category-suggestions' entry in src/lib/ai-features.ts).

import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'

import { db, type SchemaDatabase } from '@/db'
import { itemGroups, items } from '@/db/schema'
import { AiBudgetExceededError, aiGenerateObject } from '@/lib/ai-call'
import { createAiModel } from '@/lib/ai-client'
import { resolveAiConfig } from '@/lib/ai-config'
import { AI_FEATURE_SLOTS } from '@/lib/ai-slots'
import { findOrCreateCategoryByName } from '@/lib/category-carry'
import {
	buildCategorySuggestionsUserPrompt,
	CATEGORY_SUGGESTIONS_SYSTEM,
	categorySuggestionsResponseSchema,
	MAX_SUGGEST_ENTRIES,
	sanitizeCategorySuggestions,
	type SuggestEntry,
} from '@/lib/category-suggestions/prompt'
import { outputLanguageName } from '@/lib/i18n/ai-language'
import { currentLocale } from '@/lib/i18n/format'
import { visibleItemsWhere } from '@/lib/item-visibility'
import { notifyListEvent } from '@/lib/list-event-bus'
import { createLogger } from '@/lib/logger'
import { getAppSettings } from '@/lib/settings-loader'
import { LIMITS } from '@/lib/validation/limits'

import { loadCategoriesForList, loadListForCategories } from './_categories-impl'

const log = createLogger('category-suggestions')

// ===============================
// Types and schemas
// ===============================

export type CategorySuggestion = {
	name: string
	// True when the list has no category of this name yet.
	isNew: boolean
	itemIds: Array<number>
	groupIds: Array<number>
}

export type SuggestCategoriesResult =
	| { kind: 'ok'; suggestions: Array<CategorySuggestion>; unplaced: number }
	| {
			kind: 'error'
			reason:
				| 'feature-disabled'
				| 'child-not-allowed'
				| 'not-found'
				| 'not-authorized'
				| 'not-configured'
				| 'nothing-to-sort'
				| 'ai-budget-exceeded'
				| 'ai-failed'
				| 'rate-limited'
	  }

export type ApplyCategorySuggestionsResult = { kind: 'ok'; assigned: number } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export const SuggestCategoriesInputSchema = z.object({
	listId: z.number().int().positive(),
})

export const ApplyCategorySuggestionsInputSchema = z.object({
	listId: z.number().int().positive(),
	assignments: z
		.array(
			z.object({
				name: z.string().trim().min(1).max(LIMITS.CATEGORY_NAME),
				itemIds: z.array(z.number().int().positive()).max(200).default([]),
				groupIds: z.array(z.number().int().positive()).max(200).default([]),
			})
		)
		.min(1)
		.max(50),
})

// ===============================
// Helpers
// ===============================

// The rows a suggestion may touch: ungrouped items with no category, and
// groups with no category that still have a member on the list. A grouped
// item is never offered on its own, since its group's category covers it.
async function loadUncategorized(
	dbx: SchemaDatabase,
	listId: number
): Promise<{ items: Array<{ id: number; title: string }>; groups: Array<{ id: number; name: string | null; titles: Array<string> }> }> {
	const [listItems, groups] = await Promise.all([
		dbx
			.select({ id: items.id, title: items.title, groupId: items.groupId, categoryId: items.categoryId })
			.from(items)
			.where(and(eq(items.listId, listId), visibleItemsWhere('visible')))
			.orderBy(asc(items.id)),
		dbx
			.select({ id: itemGroups.id, name: itemGroups.name })
			.from(itemGroups)
			.where(and(eq(itemGroups.listId, listId), isNull(itemGroups.categoryId)))
			.orderBy(asc(itemGroups.id)),
	])
	const titlesByGroup = new Map<number, Array<string>>()
	for (const item of listItems) {
		if (item.groupId === null) continue
		const titles = titlesByGroup.get(item.groupId) ?? []
		titles.push(item.title)
		titlesByGroup.set(item.groupId, titles)
	}
	return {
		items: listItems.filter(i => i.groupId === null && i.categoryId === null).map(i => ({ id: i.id, title: i.title })),
		groups: groups.flatMap(g => {
			const titles = titlesByGroup.get(g.id)
			return titles ? [{ id: g.id, name: g.name, titles }] : []
		}),
	}
}

// ===============================
// Impls
// ===============================

export async function suggestCategoriesImpl(args: {
	actor: { id: string; isChild: boolean }
	input: z.infer<typeof SuggestCategoriesInputSchema>
	dbx?: SchemaDatabase
}): Promise<SuggestCategoriesResult> {
	const { actor, input, dbx = db } = args
	const settings = await getAppSettings(dbx)
	if (!settings.aiCategorySuggestionsEnabled) return { kind: 'error', reason: 'feature-disabled' }
	// Decided on who presses, not whose list it is: a child account cannot
	// start a model call, while a guardian editing a child's list can.
	if (actor.isChild) return { kind: 'error', reason: 'child-not-allowed' }

	const perm = await loadListForCategories(actor.id, input.listId, dbx)
	if (!perm.ok) return { kind: 'error', reason: perm.reason }

	const aiConfig = await resolveAiConfig(db, AI_FEATURE_SLOTS['category-suggestions'])
	if (!aiConfig.isValid) return { kind: 'error', reason: 'not-configured' }

	const [uncategorized, existing] = await Promise.all([loadUncategorized(dbx, input.listId), loadCategoriesForList(dbx, input.listId)])
	const entries: Array<SuggestEntry> = [
		...uncategorized.items.map(i => ({ ref: `i${i.id}`, title: i.title })),
		...uncategorized.groups.map(g => ({ ref: `g${g.id}`, title: g.name ? `${g.name}: ${g.titles.join(' / ')}` : g.titles.join(' / ') })),
	].slice(0, MAX_SUGGEST_ENTRIES)
	if (entries.length === 0) return { kind: 'error', reason: 'nothing-to-sort' }

	const model = createAiModel({
		providerType: aiConfig.providerType.value!,
		apiKey: aiConfig.apiKey.value!,
		model: aiConfig.model.value!,
		baseUrl: aiConfig.baseUrl.value,
	})
	const locale = currentLocale()
	const existingNames = existing.map(c => c.name)

	try {
		const result = await aiGenerateObject(
			{ feature: 'category-suggestions', userId: actor.id, source: 'web', db: dbx },
			{
				model,
				schema: categorySuggestionsResponseSchema,
				system: CATEGORY_SUGGESTIONS_SYSTEM,
				// The language line goes in the user prompt so the system block
				// stays identical across languages (see lib/i18n/ai-language.ts).
				prompt: buildCategorySuggestionsUserPrompt({
					entries,
					existing: existingNames,
					languageName: locale === 'en' ? null : outputLanguageName(locale),
				}),
				maxOutputTokens: aiConfig.maxOutputTokens.value,
			}
		)
		const sanitized = sanitizeCategorySuggestions(result.object.assignments, {
			refs: new Set(entries.map(e => e.ref)),
			existing: existingNames,
		})
		const suggestions = sanitized.map(s => ({
			name: s.name,
			isNew: s.isNew,
			itemIds: s.refs.filter(r => r.startsWith('i')).map(r => Number(r.slice(1))),
			groupIds: s.refs.filter(r => r.startsWith('g')).map(r => Number(r.slice(1))),
		}))
		const placed = suggestions.reduce((sum, s) => sum + s.itemIds.length + s.groupIds.length, 0)
		return { kind: 'ok', suggestions, unplaced: entries.length - placed }
	} catch (err) {
		if (err instanceof AiBudgetExceededError) return { kind: 'error', reason: 'ai-budget-exceeded' }
		log.warn({ err: err instanceof Error ? err.message : String(err) }, 'category suggestions call failed')
		return { kind: 'error', reason: 'ai-failed' }
	}
}

// Applies what the person confirmed. No model call, so it is gated on edit
// access only. Whatever the client sends back, a row is written only when
// it is on this list and still has no category, so nothing the owner placed
// is ever moved, and a category is created only when a row will go in it.
export async function applyCategorySuggestionsImpl(args: {
	userId: string
	input: z.infer<typeof ApplyCategorySuggestionsInputSchema>
	dbx?: SchemaDatabase
}): Promise<ApplyCategorySuggestionsResult> {
	const { userId, input, dbx = db } = args
	const perm = await loadListForCategories(userId, input.listId, dbx)
	if (!perm.ok) return { kind: 'error', reason: perm.reason }

	const assigned = await dbx.transaction(async tx => {
		let count = 0
		for (const assignment of input.assignments) {
			const itemIds = [...new Set(assignment.itemIds)]
			const groupIds = [...new Set(assignment.groupIds)]
			const [eligibleItems, eligibleGroups] = await Promise.all([
				itemIds.length > 0
					? tx
							.select({ id: items.id })
							.from(items)
							.where(
								and(
									inArray(items.id, itemIds),
									eq(items.listId, input.listId),
									isNull(items.categoryId),
									isNull(items.groupId),
									visibleItemsWhere('editable')
								)
							)
					: [],
				groupIds.length > 0
					? tx
							.select({ id: itemGroups.id })
							.from(itemGroups)
							.where(and(inArray(itemGroups.id, groupIds), eq(itemGroups.listId, input.listId), isNull(itemGroups.categoryId)))
					: [],
			])
			if (eligibleItems.length + eligibleGroups.length === 0) continue

			const categoryId = await findOrCreateCategoryByName(tx, input.listId, assignment.name)
			if (eligibleItems.length > 0) {
				await tx
					.update(items)
					.set({ categoryId })
					.where(
						inArray(
							items.id,
							eligibleItems.map(i => i.id)
						)
					)
			}
			if (eligibleGroups.length > 0) {
				await tx
					.update(itemGroups)
					.set({ categoryId })
					.where(
						inArray(
							itemGroups.id,
							eligibleGroups.map(g => g.id)
						)
					)
			}
			count += eligibleItems.length + eligibleGroups.length
		}
		return count
	})

	if (assigned > 0) notifyListEvent({ kind: 'item', listId: input.listId, itemId: -1 })
	return { kind: 'ok', assigned }
}
