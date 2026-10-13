// Server-only impls for the gifter-facing AI help on someone's list
// (plan 25): gift suggestions, saving one as a private idea, and the
// "about their list" interests summary.
//
// All of them read through the gifter-view impls, so the restricted-viewer
// filter and the owner redirect apply before anything reaches a prompt.
// Nothing here is ever stored where the recipient can read it. The last
// answer is kept for the asker alone (plan 29a, `gift_suggestion_sets`) so
// reopening the dialog does not ask the model again; an idea reaches
// anyone else only when the viewer saves it to their own gift-ideas list
// (private by construction) or adds it as an off-list gift.

import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { getGiftContextImpl, getWishlistViewImpl } from '@/api/_gift-context-impl'
import { createItemImpl } from '@/api/_items-impl'
import { createListImpl } from '@/api/_lists-impl'
import { db, type SchemaDatabase } from '@/db'
import {
	type BirthMonth,
	birthMonthEnumValues,
	customHolidays,
	type GiftSuggestionVerdict,
	giftSuggestionVerdictValues,
	itemAiAnalysis,
	lists,
} from '@/db/schema'
import { AiBudgetExceededError, aiGenerateObject } from '@/lib/ai-call'
import { createAiModel } from '@/lib/ai-client'
import { resolveAiConfig } from '@/lib/ai-config'
import { safeFirstName } from '@/lib/first-name'
import { clearGiftSuggestionFeedback, loadOwnSuggestionFeedback, setGiftSuggestionFeedback } from '@/lib/gift-suggestions/feedback'
import {
	buildGiftSuggestionsUserPrompt,
	GIFT_SUGGESTIONS_SYSTEM,
	type GiftSuggestion,
	giftSuggestionsResponseSchema,
	sanitizeSuggestions,
	suggestionTitleKey,
} from '@/lib/gift-suggestions/prompt'
import {
	loadLatestGiftSuggestionSet,
	replaceGiftSuggestionSet,
	type StoredSuggestionSetMeta,
	type SuggestionRecipient,
} from '@/lib/gift-suggestions/sets'
import { createLogger } from '@/lib/logger'
import { getAppSettings } from '@/lib/settings-loader'

const log = createLogger('gift-suggestions')

export const GiftSuggestionsInputSchema = z.object({
	listId: z.number().int().positive(),
	budget: z.number().positive().max(100_000).optional(),
})

export type SuggestedGift = GiftSuggestion

export type { StoredSuggestionSetMeta } from '@/lib/gift-suggestions/sets'

export type GiftSuggestionsResult =
	| { kind: 'ok'; recipientName: string; suggestions: Array<SuggestedGift>; set: StoredSuggestionSetMeta }
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

// Never an email: a user with no name set displays as their address.
function firstName(name: string | null): string {
	return safeFirstName(name, 'them')
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

// The occasion comes from the list the user is standing on, never from a
// question: a Christmas list means Christmas, a birthday list a birthday,
// a holiday list its holiday. A plain wishlist has no occasion of its own,
// so it only counts as a birthday gift when the birthday is close.
async function occasionForList(args: {
	listId: number
	listType: string
	birthdayIn: number | null
	dbx: SchemaDatabase
}): Promise<string | null> {
	if (args.listType === 'christmas') return 'Christmas'
	if (args.listType === 'birthday') return 'birthday'
	if (args.listType === 'holiday') {
		const rows = await args.dbx
			.select({ title: customHolidays.title })
			.from(lists)
			.innerJoin(customHolidays, eq(customHolidays.id, lists.customHolidayId))
			.where(eq(lists.id, args.listId))
			.limit(1)
		return rows.at(0)?.title ?? null
	}
	return args.birthdayIn !== null && args.birthdayIn <= BIRTHDAY_SOON_DAYS ? 'birthday' : null
}

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

	// Unavailable items are not wants any more; the context files them under
	// "no longer on their list".
	const allItems = c.lists.flatMap(l => l.items).filter(i => i.availability !== 'unavailable')
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
	const occasion = await occasionForList({ listId: input.listId, listType: view.view.list.type, birthdayIn, dbx })

	const myIdeas = c.myGiftIdeas.flatMap(s => s.ideas.map(i => i.title))
	const myPastGifts = c.myPastGifts.map(g => g.title)
	// What this person already has and no longer lists comes from the
	// context (received gifts, every gifter's marks, their own unavailable
	// and hidden items); what to leave out for this shopper comes from their
	// own marks.
	const alreadyHas = c.alreadyHas.map(a => ({ title: a.title, source: a.source, when: a.when }))
	const noLongerListed = c.noLongerListed
	const declined = (await loadOwnSuggestionFeedback(dbx, { userId: actor.id, recipient: { kind: recipient.kind, id: recipient.id } }))
		.filter(f => f.verdict === 'not-for-me')
		.map(f => f.title)
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
		alreadyHas,
		noLongerListed,
		declined,
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

	// A repeat of anything they have or the shopper turned down is dropped
	// even if the model ignored the instruction.
	const known = [
		...allItems.map(i => i.title),
		...myIdeas,
		...myPastGifts,
		...alreadyHas.map(a => a.title),
		...noLongerListed.map(d => d.title),
		...declined,
	]
	const suggestions = sanitizeSuggestions(raw, known)
	// Keep the answer for the asker, replacing their previous set for this
	// person, so the dialog can show it again without another model call.
	const { suggestions: stored, ...set } = await replaceGiftSuggestionSet(dbx, {
		userId: actor.id,
		recipient: { kind: recipient.kind, id: recipient.id },
		listId: input.listId,
		occasion,
		budget: input.budget ?? null,
		suggestions,
		now,
	})
	return { kind: 'ok', recipientName: firstName(c.person.name), suggestions: stored, set }
}

export const LatestGiftSuggestionSetInputSchema = z.object({ listId: z.number().int().positive() })

export type SuggestionVerdict = GiftSuggestionVerdict

export type LatestGiftSuggestionSet = StoredSuggestionSetMeta & {
	suggestions: Array<SuggestedGift>
	// Titles in the set the asker has already saved as a gift idea for this
	// person, or already added to this list as an off-list gift.
	savedTitles: Array<string>
	addedTitles: Array<string>
	// The asker's own marks on titles in the set. Never anyone else's.
	feedback: Array<{ title: string; verdict: SuggestionVerdict }>
}

export type LatestGiftSuggestionSetResult =
	| { kind: 'ok'; recipientName: string; set: LatestGiftSuggestionSet | null }
	| { kind: 'error'; reason: 'feature-disabled' | 'child-not-allowed' | 'not-found' | 'is-owner' }

/**
 * The asker's last set of ideas for the person this list is for, with the
 * Saved / Added marks derived from what they have since done with it. Reads
 * through the gifter view, so the same refusals apply as for asking; the
 * recipient (owner redirect) and anyone who cannot see the list get nothing.
 * Free to call: no model, no rate limit.
 */
export async function getLatestGiftSuggestionSetImpl(args: {
	actor: { id: string; isChild: boolean }
	input: z.infer<typeof LatestGiftSuggestionSetInputSchema>
	dbx?: SchemaDatabase
}): Promise<LatestGiftSuggestionSetResult> {
	const { actor, input, dbx = db } = args
	const settings = await getAppSettings(dbx)
	if (!settings.aiGiftSuggestionsEnabled) return { kind: 'error', reason: 'feature-disabled' }
	if (actor.isChild) return { kind: 'error', reason: 'child-not-allowed' }

	const view = await getWishlistViewImpl({ userId: actor.id, listId: input.listId, dbx })
	if (view.kind === 'error') return { kind: 'error', reason: view.reason }
	const recipient: SuggestionRecipient = { kind: view.view.list.recipient.kind, id: view.view.list.recipient.id }
	const recipientName = firstName(view.view.list.recipient.name)

	const stored = await loadLatestGiftSuggestionSet(dbx, { userId: actor.id, recipient })
	if (!stored) return { kind: 'ok', recipientName, set: null }

	const ideaKeys = new Set(view.view.myGiftIdeas.flatMap(s => s.ideas.map(i => suggestionTitleKey(i.title))))
	const addonKeys = new Set(view.view.offListGifts.filter(a => a.byMe).map(a => suggestionTitleKey(a.description)))
	const own = new Map((await loadOwnSuggestionFeedback(dbx, { userId: actor.id, recipient })).map(f => [f.titleKey, f.verdict]))
	const { suggestions, ...meta } = stored
	return {
		kind: 'ok',
		recipientName,
		set: {
			...meta,
			suggestions,
			savedTitles: suggestions.filter(s => ideaKeys.has(suggestionTitleKey(s.title))).map(s => s.title),
			addedTitles: suggestions.filter(s => addonKeys.has(suggestionTitleKey(s.title))).map(s => s.title),
			feedback: suggestions.flatMap(s => {
				const verdict = own.get(suggestionTitleKey(s.title))
				return verdict ? [{ title: s.title, verdict }] : []
			}),
		},
	}
}

export const GiftSuggestionFeedbackInputSchema = z.object({
	listId: z.number().int().positive(),
	title: z.string().trim().min(1).max(200),
	verdict: z.enum(giftSuggestionVerdictValues),
})

export const ClearGiftSuggestionFeedbackInputSchema = z.object({
	listId: z.number().int().positive(),
	title: z.string().trim().min(1).max(200),
})

export type GiftSuggestionFeedbackResult =
	| { kind: 'ok' }
	| { kind: 'error'; reason: 'feature-disabled' | 'child-not-allowed' | 'not-found' | 'is-owner' }

async function feedbackRecipient(args: {
	actor: { id: string; isChild: boolean }
	listId: number
	dbx: SchemaDatabase
}): Promise<
	| { kind: 'ok'; recipient: SuggestionRecipient }
	| { kind: 'error'; reason: 'feature-disabled' | 'child-not-allowed' | 'not-found' | 'is-owner' }
> {
	const settings = await getAppSettings(args.dbx)
	if (!settings.aiGiftSuggestionsEnabled) return { kind: 'error', reason: 'feature-disabled' }
	if (args.actor.isChild) return { kind: 'error', reason: 'child-not-allowed' }
	const view = await getWishlistViewImpl({ userId: args.actor.id, listId: args.listId, dbx: args.dbx })
	if (view.kind === 'error') return { kind: 'error', reason: view.reason }
	return { kind: 'ok', recipient: { kind: view.view.list.recipient.kind, id: view.view.list.recipient.id } }
}

/**
 * "They have it" or thumbs down on an idea for the person this list is for.
 * Same gate as asking: the flag, no children, the owner redirect, and list
 * visibility. Marking again replaces the earlier verdict.
 */
export async function setGiftSuggestionFeedbackImpl(args: {
	actor: { id: string; isChild: boolean }
	input: z.infer<typeof GiftSuggestionFeedbackInputSchema>
	now: Date
	dbx?: SchemaDatabase
}): Promise<GiftSuggestionFeedbackResult> {
	const { actor, input, now, dbx = db } = args
	const gate = await feedbackRecipient({ actor, listId: input.listId, dbx })
	if (gate.kind === 'error') return gate
	await setGiftSuggestionFeedback(dbx, { userId: actor.id, recipient: gate.recipient, title: input.title, verdict: input.verdict, now })
	return { kind: 'ok' }
}

/** Undo a mark. Clearing a title that was never marked is still ok. */
export async function clearGiftSuggestionFeedbackImpl(args: {
	actor: { id: string; isChild: boolean }
	input: z.infer<typeof ClearGiftSuggestionFeedbackInputSchema>
	dbx?: SchemaDatabase
}): Promise<GiftSuggestionFeedbackResult> {
	const { actor, input, dbx = db } = args
	const gate = await feedbackRecipient({ actor, listId: input.listId, dbx })
	if (gate.kind === 'error') return gate
	await clearGiftSuggestionFeedback(dbx, { userId: actor.id, recipient: gate.recipient, title: input.title })
	return { kind: 'ok' }
}

export const SaveGiftSuggestionInputSchema = z.object({
	listId: z.number().int().positive(),
	title: z.string().trim().min(1).max(200),
	notes: z.string().trim().max(1000).optional(),
})

export type SaveGiftSuggestionResult =
	| { kind: 'ok'; ideasListId: number; itemId: number; createdList: boolean }
	| { kind: 'error'; reason: 'feature-disabled' | 'not-found' | 'is-owner' | 'child-not-allowed' | 'not-allowed' }

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
	// The whole feature sits behind the one admin flag, saving included, so
	// turning it off leaves no part of it reachable.
	const settings = await getAppSettings(dbx)
	if (!settings.aiGiftSuggestionsEnabled) return { kind: 'error', reason: 'feature-disabled' }
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
	// Part of the Need Ideas dialog, so it follows that feature's flag as
	// well as Intelligence (which produced the facets it reads).
	if (!settings.aiGiftSuggestionsEnabled || !settings.intelligenceEnabled) return none
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
