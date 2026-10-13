// Server-only storage for what gifters said about ideas (plan 29b):
// "They have it" and "not for me".
//
// Keyed by title key, not by suggestion row, so a mark outlives the set it
// was made on. `has-it` is about the recipient and is read for every gifter
// of that person; `not-for-me` is the marker's taste and is read for the
// marker only. Nothing here is ever shown to the recipient, and another
// gifter's marks are never shown to the asker: they only shape future sets.

import { and, asc, eq } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { giftSuggestionFeedback, type GiftSuggestionVerdict } from '@/db/schema'

import { suggestionTitleKey } from './prompt'
import type { SuggestionRecipient } from './sets'

export type OwnSuggestionFeedback = { title: string; titleKey: string; verdict: GiftSuggestionVerdict }

function recipientWhere(recipient: SuggestionRecipient) {
	return recipient.kind === 'dependent'
		? eq(giftSuggestionFeedback.recipientDependentId, recipient.id)
		: eq(giftSuggestionFeedback.recipientUserId, recipient.id)
}

/** Record a verdict, replacing any earlier one by this marker for the same title. */
export async function setGiftSuggestionFeedback(
	dbx: SchemaDatabase,
	args: { userId: string; recipient: SuggestionRecipient; title: string; verdict: GiftSuggestionVerdict; now: Date }
): Promise<void> {
	const titleKey = suggestionTitleKey(args.title)
	await dbx.transaction(async tx => {
		await tx
			.delete(giftSuggestionFeedback)
			.where(
				and(eq(giftSuggestionFeedback.userId, args.userId), recipientWhere(args.recipient), eq(giftSuggestionFeedback.titleKey, titleKey))
			)
		await tx.insert(giftSuggestionFeedback).values({
			userId: args.userId,
			recipientUserId: args.recipient.kind === 'user' ? args.recipient.id : null,
			recipientDependentId: args.recipient.kind === 'dependent' ? args.recipient.id : null,
			titleKey,
			title: args.title,
			verdict: args.verdict,
			createdAt: args.now,
		})
	})
}

/** Undo: remove this marker's verdict for the title. True when a row went. */
export async function clearGiftSuggestionFeedback(
	dbx: SchemaDatabase,
	args: { userId: string; recipient: SuggestionRecipient; title: string }
): Promise<boolean> {
	const rows = await dbx
		.delete(giftSuggestionFeedback)
		.where(
			and(
				eq(giftSuggestionFeedback.userId, args.userId),
				recipientWhere(args.recipient),
				eq(giftSuggestionFeedback.titleKey, suggestionTitleKey(args.title))
			)
		)
		.returning({ id: giftSuggestionFeedback.id })
	return rows.length > 0
}

/**
 * Titles any gifter marked as something this person already has, oldest
 * first, one per title key. Who marked them is deliberately not returned.
 */
export async function loadAlreadyHasTitles(dbx: SchemaDatabase, recipient: SuggestionRecipient): Promise<Array<string>> {
	const rows = await dbx
		.select({ title: giftSuggestionFeedback.title, titleKey: giftSuggestionFeedback.titleKey })
		.from(giftSuggestionFeedback)
		.where(and(recipientWhere(recipient), eq(giftSuggestionFeedback.verdict, 'has-it')))
		.orderBy(asc(giftSuggestionFeedback.createdAt), asc(giftSuggestionFeedback.id))
	const seen = new Set<string>()
	const out: Array<string> = []
	for (const r of rows) {
		if (seen.has(r.titleKey)) continue
		seen.add(r.titleKey)
		out.push(r.title)
	}
	return out
}

/** Everything this one user has said about ideas for this person. */
export async function loadOwnSuggestionFeedback(
	dbx: SchemaDatabase,
	args: { userId: string; recipient: SuggestionRecipient }
): Promise<Array<OwnSuggestionFeedback>> {
	return dbx
		.select({ title: giftSuggestionFeedback.title, titleKey: giftSuggestionFeedback.titleKey, verdict: giftSuggestionFeedback.verdict })
		.from(giftSuggestionFeedback)
		.where(and(eq(giftSuggestionFeedback.userId, args.userId), recipientWhere(args.recipient)))
		.orderBy(asc(giftSuggestionFeedback.createdAt), asc(giftSuggestionFeedback.id))
}
