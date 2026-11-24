// Gift exchanges (Secret Santa). An admin sets up an exchange, picks the
// people in it (members), says who can gift to whom, and draws names. The
// draw writes one pairing per member: `givesToMemberId` points at the
// member they gift to. See plan 39 and `src/lib/gift-exchange/`.
//
// "Participant" already means a gifter unit credited on a claim, so a person
// in an exchange is a member and their pairing is an assignment.
//
// State is derived, never stored: not drawn (`drawnAt` null), drawn, or
// archived (`archivedAt` set). An exchange has no claim, reveal or
// gift-credit rules of its own.

import { relations } from 'drizzle-orm'
import { type AnyPgColumn, date, index, numeric, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

import { timestamps } from './shared'
import { users } from './users'

export const giftExchanges = pgTable('gift_exchanges', {
	id: uuid('id').primaryKey().defaultRandom(),
	// Typed by the admin, never translated.
	name: text('name').notNull(),
	// An amount, formatted for the reader. Null means no budget.
	budget: numeric('budget', { precision: 10, scale: 2 }),
	// Copied from the `defaultCurrency` setting when the budget is saved, so
	// a later change of the default doesn't relabel old exchanges.
	budgetCurrency: text('budget_currency'),
	// A calendar date, compared and formatted as one.
	giftDate: date('gift_date', { mode: 'string' }).notNull(),
	// Null until the first draw; updated by a redraw.
	drawnAt: timestamp('drawn_at', { withTimezone: true }),
	// Set once, never cleared.
	archivedAt: timestamp('archived_at', { withTimezone: true }),
	createdByUserId: text('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
	...timestamps,
})

export const giftExchangeMembers = pgTable(
	'gift_exchange_members',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		exchangeId: uuid('exchange_id')
			.notNull()
			.references(() => giftExchanges.id, { onDelete: 'cascade' }),
		// Null only in archived exchanges, after the account was deleted
		// ("Deleted user"). Unarchived exchanges remove the member instead.
		userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
		// The pairing: the member this member gifts to. Null before the draw.
		givesToMemberId: uuid('gives_to_member_id').references((): AnyPgColumn => giftExchangeMembers.id, { onDelete: 'set null' }),
		// When they looked at the current pairing.
		seenAt: timestamp('seen_at', { withTimezone: true }),
		// Set when their pairing is replaced; cleared when they look.
		changedAt: timestamp('changed_at', { withTimezone: true }),
		// Set by Send Emails (and by the changed email).
		readyEmailSentAt: timestamp('ready_email_sent_at', { withTimezone: true }),
	},
	table => [
		unique('gift_exchange_members_exchange_id_user_id_unique').on(table.exchangeId, table.userId),
		index('gift_exchange_members_user_id_idx').on(table.userId),
	]
)

// One row per direction an admin set to No. No row means Yes. The fixed
// limits (self, an explicit `none`, a child gifting to their guardian) are
// never stored here; they are computed at every check.
export const giftExchangeBlocks = pgTable(
	'gift_exchange_blocks',
	{
		exchangeId: uuid('exchange_id')
			.notNull()
			.references(() => giftExchanges.id, { onDelete: 'cascade' }),
		giverMemberId: uuid('giver_member_id')
			.notNull()
			.references(() => giftExchangeMembers.id, { onDelete: 'cascade' }),
		recipientMemberId: uuid('recipient_member_id')
			.notNull()
			.references(() => giftExchangeMembers.id, { onDelete: 'cascade' }),
	},
	table => [primaryKey({ columns: [table.exchangeId, table.giverMemberId, table.recipientMemberId] })]
)

export const giftExchangesRelations = relations(giftExchanges, ({ one, many }) => ({
	createdBy: one(users, {
		fields: [giftExchanges.createdByUserId],
		references: [users.id],
	}),
	members: many(giftExchangeMembers),
	blocks: many(giftExchangeBlocks),
}))

export const giftExchangeMembersRelations = relations(giftExchangeMembers, ({ one }) => ({
	exchange: one(giftExchanges, {
		fields: [giftExchangeMembers.exchangeId],
		references: [giftExchanges.id],
	}),
	user: one(users, {
		fields: [giftExchangeMembers.userId],
		references: [users.id],
	}),
	givesTo: one(giftExchangeMembers, {
		fields: [giftExchangeMembers.givesToMemberId],
		references: [giftExchangeMembers.id],
		relationName: 'giftExchangeAssignment',
	}),
}))

export const giftExchangeBlocksRelations = relations(giftExchangeBlocks, ({ one }) => ({
	exchange: one(giftExchanges, {
		fields: [giftExchangeBlocks.exchangeId],
		references: [giftExchanges.id],
	}),
	giver: one(giftExchangeMembers, {
		fields: [giftExchangeBlocks.giverMemberId],
		references: [giftExchangeMembers.id],
		relationName: 'giftExchangeBlockGiver',
	}),
	recipient: one(giftExchangeMembers, {
		fields: [giftExchangeBlocks.recipientMemberId],
		references: [giftExchangeMembers.id],
		relationName: 'giftExchangeBlockRecipient',
	}),
}))

export type GiftExchange = typeof giftExchanges.$inferSelect
export type NewGiftExchange = typeof giftExchanges.$inferInsert
export type GiftExchangeMember = typeof giftExchangeMembers.$inferSelect
export type NewGiftExchangeMember = typeof giftExchangeMembers.$inferInsert
export type GiftExchangeBlock = typeof giftExchangeBlocks.$inferSelect
export type NewGiftExchangeBlock = typeof giftExchangeBlocks.$inferInsert
