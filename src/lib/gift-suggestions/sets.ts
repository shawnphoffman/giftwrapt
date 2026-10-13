// Server-only storage for "Need ideas?" answers (plan 29a).
//
// A set is the last answer one asker got for one recipient. It is read back
// so reopening the dialog shows it without a new model call; a regenerate
// replaces it. Only the asker's rows are ever loaded, keyed by their own id
// and the recipient, so the recipient and other gifters cannot reach a set
// through any path here. Callers still gate on list visibility before
// calling in (the impls go through `getWishlistViewImpl` first).
//
// Not a cache of anything the recipient owns: deleting a list, a user, or a
// dependent cascades the sets away, and the retention sweep removes the
// rest after `giftSuggestionRetentionDays`.

import { and, asc, desc, eq, lt } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { giftSuggestions, giftSuggestionSets } from '@/db/schema'

import { type GiftSuggestion, PRICE_BANDS, type PriceBand, suggestionTitleKey } from './prompt'

export type SuggestionRecipient = { kind: 'user' | 'dependent'; id: string }

export type StoredSuggestionSetMeta = {
	id: number
	createdAt: string
	listId: number | null
	occasion: string | null
	budget: number | null
}

export type StoredSuggestionSet = StoredSuggestionSetMeta & { suggestions: Array<GiftSuggestion> }

function ownSetsWhere(userId: string, recipient: SuggestionRecipient) {
	return and(
		eq(giftSuggestionSets.userId, userId),
		recipient.kind === 'dependent'
			? eq(giftSuggestionSets.recipientDependentId, recipient.id)
			: eq(giftSuggestionSets.recipientUserId, recipient.id)
	)
}

function toPriceBand(value: string): PriceBand {
	return (PRICE_BANDS as ReadonlyArray<string>).includes(value) ? (value as PriceBand) : 'unknown'
}

/**
 * Store a freshly generated set for this asker and recipient, replacing the
 * previous one in the same transaction so at most one set exists per pair.
 */
export async function replaceGiftSuggestionSet(
	dbx: SchemaDatabase,
	args: {
		userId: string
		recipient: SuggestionRecipient
		listId: number
		occasion: string | null
		budget: number | null
		suggestions: Array<GiftSuggestion>
		now: Date
	}
): Promise<StoredSuggestionSet> {
	return dbx.transaction(async tx => {
		await tx.delete(giftSuggestionSets).where(ownSetsWhere(args.userId, args.recipient))
		const [set] = await tx
			.insert(giftSuggestionSets)
			.values({
				userId: args.userId,
				recipientUserId: args.recipient.kind === 'user' ? args.recipient.id : null,
				recipientDependentId: args.recipient.kind === 'dependent' ? args.recipient.id : null,
				listId: args.listId,
				occasion: args.occasion,
				budget: args.budget,
				createdAt: args.now,
			})
			.returning()
		if (args.suggestions.length) {
			await tx.insert(giftSuggestions).values(
				args.suggestions.map((s, position) => ({
					setId: set.id,
					position,
					title: s.title,
					titleKey: suggestionTitleKey(s.title),
					details: s.details,
					reason: s.reason,
					priceBand: s.priceBand,
				}))
			)
		}
		return {
			id: set.id,
			createdAt: set.createdAt.toISOString(),
			listId: set.listId,
			occasion: set.occasion,
			budget: set.budget,
			suggestions: args.suggestions,
		}
	})
}

/** The asker's latest set for this recipient, or null when they have none. */
export async function loadLatestGiftSuggestionSet(
	dbx: SchemaDatabase,
	args: { userId: string; recipient: SuggestionRecipient }
): Promise<StoredSuggestionSet | null> {
	const set = (
		await dbx
			.select()
			.from(giftSuggestionSets)
			.where(ownSetsWhere(args.userId, args.recipient))
			.orderBy(desc(giftSuggestionSets.createdAt), desc(giftSuggestionSets.id))
			.limit(1)
	).at(0)
	if (!set) return null
	const rows = await dbx.select().from(giftSuggestions).where(eq(giftSuggestions.setId, set.id)).orderBy(asc(giftSuggestions.position))
	return {
		id: set.id,
		createdAt: set.createdAt.toISOString(),
		listId: set.listId,
		occasion: set.occasion,
		budget: set.budget,
		suggestions: rows.map(r => ({ title: r.title, details: r.details, reason: r.reason, priceBand: toPriceBand(r.priceBand) })),
	}
}

/** Daily cleanup: drop sets older than the retention window (rows cascade). */
export async function sweepGiftSuggestionSets(args: {
	db: SchemaDatabase
	now: Date
	retentionDays: number
}): Promise<{ deleted: number }> {
	const cutoff = new Date(args.now.getTime() - args.retentionDays * 86_400_000)
	const rows = await args.db
		.delete(giftSuggestionSets)
		.where(lt(giftSuggestionSets.createdAt, cutoff))
		.returning({ id: giftSuggestionSets.id })
	return { deleted: rows.length }
}
