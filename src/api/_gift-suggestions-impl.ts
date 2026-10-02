// Server-only impls for the gifter-facing AI help on someone's list
// (plan 25): gift suggestions, saving one as a private idea, and the
// "about their list" interests summary.
//
// All three read through the gifter-view impls, so the restricted-viewer
// filter and the owner redirect apply before anything reaches a prompt.
// Nothing here is ever stored where the recipient can read it: a
// suggestion only persists when the viewer saves it to their own
// gift-ideas list, which is private by construction.

import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { getGiftContextImpl, getWishlistViewImpl } from '@/api/_gift-context-impl'
import { createItemImpl } from '@/api/_items-impl'
import { createListImpl } from '@/api/_lists-impl'
import { db, type SchemaDatabase } from '@/db'
import { type BirthMonth, birthMonthEnumValues, itemAiAnalysis, lists } from '@/db/schema'
import { AiBudgetExceededError, aiGenerateObject } from '@/lib/ai-call'
import { createAiModel } from '@/lib/ai-client'
import { resolveAiConfig } from '@/lib/ai-config'
import {
	buildGiftSuggestionsUserPrompt,
	GIFT_SUGGESTIONS_SYSTEM,
	type GiftSuggestion,
	giftSuggestionsResponseSchema,
	sanitizeSuggestions,
	searchUrlFor,
} from '@/lib/gift-suggestions/prompt'
import { createLogger } from '@/lib/logger'
import { getAppSettings } from '@/lib/settings-loader'

const log = createLogger('gift-suggestions')

export const GiftSuggestionsInputSchema = z.object({
	listId: z.number().int().positive(),
	budget: z.number().positive().max(100_000).optional(),
	occasion: z.string().trim().max(80).optional(),
})

export type SuggestedGift = GiftSuggestion & { searchUrl: string }

export type GiftSuggestionsResult =
	| { kind: 'ok'; recipientName: string; suggestions: Array<SuggestedGift> }
	| {
			kind: 'error'
			reason:
				| 'feature-disabled'
				| 'not-configured'
				| 'child-not-allowed'
				| 'not-found'
				| 'is-owner'
				| 'ai-budget-exceeded'
				| 'ai-failed'
				| 'rate-limited'
	  }

function firstName(name: string | null): string {
	return (name ?? '').trim().split(/\s+/u)[0] || 'them'
}

function daysUntil(month: BirthMonth | null, day: number | null, now: Date): number | null {
	if (!month || !day) return null
	const idx = birthMonthEnumValues.indexOf(month)
	if (idx < 0) return null
	const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
	let next = Date.UTC(now.getUTCFullYear(), idx, day)
	if (next < start) next = Date.UTC(now.getUTCFullYear() + 1, idx, day)
	return Math.round((next - start) / 86_400_000)
}

const BIRTHDAY_SOON_DAYS = 60

export async function getGiftSuggestionsImpl(args: {
	actor: { id: string; isChild: boolean }
	input: z.infer<typeof GiftSuggestionsInputSchema>
	now: Date
	dbx?: SchemaDatabase
}): Promise<GiftSuggestionsResult> {
	const { actor, input, now, dbx = db } = args

	const settings = await getAppSettings(dbx)
	if (!settings.aiGiftSuggestionsEnabled) return { kind: 'error', reason: 'feature-disabled' }
	// Settled in plan 25: a child cannot ask the AI for gift ideas, the same
	// line as "children cannot connect AI assistants". An adult may ask for
	// ideas for a child.
	if (actor.isChild) return { kind: 'error', reason: 'child-not-allowed' }

	const aiConfig = await resolveAiConfig(db)
	if (!aiConfig.isValid) return { kind: 'error', reason: 'not-configured' }

	// The list decides who the recipient is; the context then covers every
	// list of theirs the viewer can see.
	const view = await getWishlistViewImpl({ userId: actor.id, listId: input.listId, dbx })
	if (view.kind === 'error') return { kind: 'error', reason: view.reason }
	const recipient = view.view.list.recipient
	const context = await getGiftContextImpl({ userId: actor.id, personId: recipient.id, now, dbx })
	if (context.kind === 'error') return { kind: 'error', reason: context.reason }
	const c = context.context

	const allItems = c.lists.flatMap(l => l.items)
	const facets = allItems.length
		? await dbx
				.select({ itemId: itemAiAnalysis.itemId, category: itemAiAnalysis.category })
				.from(itemAiAnalysis)
				.where(
					inArray(
						itemAiAnalysis.itemId,
						allItems.map(i => i.id)
					)
				)
		: []
	const categoryOf = new Map(facets.map(f => [f.itemId, f.category]))

	const birthdayIn = daysUntil(c.person.birthMonth, c.person.birthDay, now)
	const occasion =
		input.occasion || (birthdayIn !== null && birthdayIn <= BIRTHDAY_SOON_DAYS ? 'birthday' : (c.upcomingHolidays.at(0)?.title ?? null))

	const myIdeas = c.myGiftIdeas.flatMap(s => s.ideas.map(i => i.title))
	const myPastGifts = c.myPastGifts.map(g => g.title)
	const userPrompt = buildGiftSuggestionsUserPrompt({
		recipientFirstName: firstName(c.person.name),
		recipientKind: c.person.kind,
		items: allItems.map(i => ({
			title: i.title,
			price: i.price,
			priority: i.priority,
			category: categoryOf.get(i.id) ?? null,
			// The only claim signal that ever reaches the prompt.
			claimed: i.remaining === 0,
		})),
		myIdeas,
		myPastGifts,
		occasion,
		budget: input.budget ?? null,
	})

	const model = createAiModel({
		providerType: aiConfig.providerType.value!,
		apiKey: aiConfig.apiKey.value!,
		model: aiConfig.model.value!,
		baseUrl: aiConfig.baseUrl.value,
	})

	let raw: Array<GiftSuggestion>
	try {
		const result = await aiGenerateObject(
			{ feature: 'gift-suggestions', userId: actor.id, source: 'web', db: dbx },
			{
				model,
				schema: giftSuggestionsResponseSchema,
				system: GIFT_SUGGESTIONS_SYSTEM,
				prompt: userPrompt,
				maxOutputTokens: aiConfig.maxOutputTokens.value,
			}
		)
		raw = result.object.suggestions
	} catch (err) {
		if (err instanceof AiBudgetExceededError) return { kind: 'error', reason: 'ai-budget-exceeded' }
		log.warn({ err: err instanceof Error ? err.message : String(err) }, 'gift suggestions call failed')
		return { kind: 'error', reason: 'ai-failed' }
	}

	const known = [...allItems.map(i => i.title), ...myIdeas, ...myPastGifts]
	const suggestions = sanitizeSuggestions(raw, known).map(s => ({ ...s, searchUrl: searchUrlFor(s.title) }))
	return { kind: 'ok', recipientName: firstName(c.person.name), suggestions }
}

export const SaveGiftSuggestionInputSchema = z.object({
	listId: z.number().int().positive(),
	title: z.string().trim().min(1).max(200),
	notes: z.string().trim().max(500).optional(),
})

export type SaveGiftSuggestionResult =
	| { kind: 'ok'; ideasListId: number; itemId: number; createdList: boolean }
	| { kind: 'error'; reason: 'not-found' | 'is-owner' | 'child-not-allowed' | 'not-allowed' }

/**
 * Save a suggestion as one of the viewer's private gift ideas for the
 * list's recipient, creating their gift-ideas list for that person when
 * they do not have one. From there it shows in the Gift Ideas section and
 * can be turned into an off-list gift like any other idea.
 */
export async function saveGiftSuggestionImpl(args: {
	actor: { id: string; isChild: boolean }
	input: z.infer<typeof SaveGiftSuggestionInputSchema>
	dbx?: SchemaDatabase
}): Promise<SaveGiftSuggestionResult> {
	const { actor, input, dbx = db } = args
	if (actor.isChild) return { kind: 'error', reason: 'child-not-allowed' }

	const view = await getWishlistViewImpl({ userId: actor.id, listId: input.listId, dbx })
	if (view.kind === 'error') return { kind: 'error', reason: view.reason }
	const recipient = view.view.list.recipient

	const target =
		recipient.kind === 'dependent' ? eq(lists.giftIdeasTargetDependentId, recipient.id) : eq(lists.giftIdeasTargetUserId, recipient.id)
	const existing = await dbx
		.select({ id: lists.id })
		.from(lists)
		.where(and(eq(lists.ownerId, actor.id), eq(lists.type, 'giftideas'), eq(lists.isActive, true), target))
		.orderBy(lists.id)
		.limit(1)

	let ideasListId = existing.at(0)?.id
	let createdList = false
	if (ideasListId === undefined) {
		const created = await createListImpl({
			actor,
			input: {
				name: `Ideas for ${firstName(recipient.name)}`.slice(0, 200),
				type: 'giftideas',
				isPrivate: true,
				...(recipient.kind === 'dependent' ? { giftIdeasTargetDependentId: recipient.id } : { giftIdeasTargetUserId: recipient.id }),
			},
		})
		if (created.kind === 'error') return { kind: 'error', reason: 'not-allowed' }
		ideasListId = created.list.id
		createdList = true
	}

	const item = await createItemImpl({ db: dbx, actor, input: { listId: ideasListId, title: input.title, notes: input.notes } })
	if (item.kind === 'error') return { kind: 'error', reason: 'not-allowed' }
	return { kind: 'ok', ideasListId, itemId: item.item.id, createdList }
}

export type ListInterests = { interests: Array<{ category: string; count: number }>; analysedItems: number }

const MIN_ANALYSED_ITEMS = 3
const MAX_INTERESTS = 4

/**
 * What one list is mostly about, from enrichment facets Intelligence has
 * already stored. No model call. Empty unless Intelligence is on and
 * enough of the list has been analysed to say something true.
 */
export async function getListInterestsImpl(args: { userId: string; listId: number; dbx?: SchemaDatabase }): Promise<ListInterests> {
	const { userId, listId, dbx = db } = args
	const none: ListInterests = { interests: [], analysedItems: 0 }
	const settings = await getAppSettings(dbx)
	if (!settings.intelligenceEnabled) return none
	const view = await getWishlistViewImpl({ userId, listId, dbx })
	if (view.kind === 'error') return none
	const itemIds = view.view.items.map(i => i.id)
	if (itemIds.length === 0) return none
	const facets = await dbx.select({ category: itemAiAnalysis.category }).from(itemAiAnalysis).where(inArray(itemAiAnalysis.itemId, itemIds))
	if (facets.length < MIN_ANALYSED_ITEMS) return { interests: [], analysedItems: facets.length }
	const counts = new Map<string, number>()
	for (const f of facets) {
		if (!f.category || f.category === 'other') continue
		counts.set(f.category, (counts.get(f.category) ?? 0) + 1)
	}
	const interests = [...counts.entries()]
		.map(([category, count]) => ({ category, count }))
		.sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
		.slice(0, MAX_INTERESTS)
	return { interests, analysedItems: facets.length }
}
