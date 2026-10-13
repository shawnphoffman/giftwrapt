import { doublePrecision, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

import { dependents } from './dependents'
import { lists } from './lists'
import { users } from './users'

// =====================================================================
// GIFT SUGGESTION SETS (the last "Need ideas?" answer, per asker)
// =====================================================================
//
// Plan 29a. When a gifter asks the AI for ideas for someone, the answer is
// kept so reopening the dialog shows it again instead of paying for a new
// model call. A set belongs to the user who asked (`userId`) and is about
// one recipient (`recipientUserId` XOR `recipientDependentId`, app-layer
// enforced like `lists.giftIdeasTarget*`). Only the asker ever reads it:
// never the recipient, never another gifter. One set per (asker,
// recipient): a regenerate replaces the previous set in the same
// transaction.
//
// Sets are regenerated on request and are not backed up; the asker's
// decisions survive as Gift Ideas items and off-list gifts. Rows older than
// `giftSuggestionRetentionDays` are swept by the daily cleanup cron.

export const giftSuggestionSets = pgTable(
	'gift_suggestion_sets',
	{
		id: serial('id').primaryKey(),
		// The asker.
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		recipientUserId: text('recipient_user_id').references(() => users.id, { onDelete: 'cascade' }),
		recipientDependentId: text('recipient_dependent_id').references(() => dependents.id, { onDelete: 'cascade' }),
		// The list the asker stood on when asking; the occasion came from its
		// type. Kept for the caption only, so a deleted list just nulls it.
		listId: integer('list_id').references(() => lists.id, { onDelete: 'set null' }),
		occasion: text('occasion'),
		budget: doublePrecision('budget'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	},
	table => [
		index('gift_suggestion_sets_user_recipient_user_idx').on(table.userId, table.recipientUserId, table.createdAt.desc()),
		index('gift_suggestion_sets_user_recipient_dependent_idx').on(table.userId, table.recipientDependentId, table.createdAt.desc()),
		index('gift_suggestion_sets_created_at_idx').on(table.createdAt),
	]
)

export const giftSuggestions = pgTable(
	'gift_suggestions',
	{
		id: serial('id').primaryKey(),
		setId: integer('set_id')
			.notNull()
			.references(() => giftSuggestionSets.id, { onDelete: 'cascade' }),
		position: integer('position').notNull(),
		title: text('title').notNull(),
		// `suggestionTitleKey(title)` from src/lib/gift-suggestions/prompt.ts,
		// so feedback (plan 29b) and the Saved / Added marks can match a title
		// across regenerations without caring about case or punctuation.
		titleKey: text('title_key').notNull(),
		details: text('details').notNull(),
		reason: text('reason').notNull(),
		// One of PRICE_BANDS in src/lib/gift-suggestions/prompt.ts.
		priceBand: text('price_band').notNull(),
	},
	table => [index('gift_suggestions_set_idx').on(table.setId)]
)

export type GiftSuggestionSetRow = typeof giftSuggestionSets.$inferSelect
export type GiftSuggestionRow = typeof giftSuggestions.$inferSelect
