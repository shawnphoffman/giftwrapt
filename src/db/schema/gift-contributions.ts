import { relations, sql } from 'drizzle-orm'
import { check, index, integer, numeric, pgTable, serial, text, unique } from 'drizzle-orm/pg-core'

import { giftedItems } from './gifts'
import { timestamps } from './shared'
import { users } from './users'

// ===============================
// GIFT CONTRIBUTIONS (custom split)
// ===============================
// A per-co-gifter dollar override on a claim's even split. Rows exist ONLY when
// the primary gifter sets a custom split; the absence of rows means each gifter
// unit's contribution is the even split computed at read time. Only CO-GIFTER
// amounts are stored - the primary unit's share is the residual
// (totalCost - SUM(co-gifter amounts)), exact by construction. All rows for a
// claim are deleted on any structural change (totalCost or the participant set)
// so the split falls back to even (reset-to-even, decided 2026-06-10).
//
// Spoiler-protected cost data, same class as giftedItems: never surfaced to the
// recipient, never joined into intelligence analyzer prompts.
export const giftContributions = pgTable(
	'gift_contributions',
	{
		id: serial('id').primaryKey(),
		giftId: integer('gift_id')
			.notNull()
			.references(() => giftedItems.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		amount: numeric('amount').notNull(),
		...timestamps,
	},
	table => [
		index('gift_contributions_giftId_idx').on(table.giftId),
		// One contribution row per (claim, gifter); the upsert path replaces in place.
		unique('gift_contributions_giftId_userId_uq').on(table.giftId, table.userId),
		check('gift_contributions_amount_nonneg', sql`${table.amount} >= 0`),
	]
)

export const giftContributionsRelations = relations(giftContributions, ({ one }) => ({
	gift: one(giftedItems, { fields: [giftContributions.giftId], references: [giftedItems.id] }),
	user: one(users, { fields: [giftContributions.userId], references: [users.id] }),
}))

export type GiftContribution = typeof giftContributions.$inferSelect
export type NewGiftContribution = typeof giftContributions.$inferInsert
