import { relations } from 'drizzle-orm'
import { boolean, index, integer, numeric, pgTable, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { customHolidays } from './custom-holidays'
import { dependents } from './dependents'
import { listTypeEnum } from './enums'
import { itemGroups, items } from './items'
import { listEditors } from './permissions'
import { timestamps } from './shared'
import { users } from './users'

// ===============================
// LISTS
// ===============================
export const lists = pgTable(
	'lists',
	{
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		type: listTypeEnum('type').default('wishlist').notNull(),
		isActive: boolean('is_active').default(true).notNull(),
		isPrivate: boolean('is_private').default(false).notNull(),
		isPrimary: boolean('is_primary').default(false).notNull(),
		description: text('description'),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		// When set, this list is FOR a non-user dependent (pet, baby, etc.).
		// Permission predicates (canViewList / canEditList) consult
		// `dependentGuardianships` for the subject; gifters see the
		// dependent's name/avatar in place of the owner's. The `ownerId`
		// in this case is the guardian who created the list.
		subjectDependentId: text('subject_dependent_id').references(() => dependents.id, { onDelete: 'cascade' }),
		// Only populated for type === 'giftideas'. The user this list is tracking ideas FOR.
		// Never visible to that user.
		giftIdeasTargetUserId: text('gift_ideas_target_user_id').references(() => users.id, { onDelete: 'set null' }),
		// Only populated for type === 'giftideas' when the target is a
		// dependent rather than a user. Mutually exclusive with
		// `giftIdeasTargetUserId` (enforced in the API layer).
		giftIdeasTargetDependentId: text('gift_ideas_target_dependent_id').references(() => dependents.id, {
			onDelete: 'set null',
		}),
		// Stamped by the auto-archive cron when it fires for this list's
		// most recent occurrence. Per-(list, holiday); nulled on holiday
		// change so a repurposed list never inherits stale archive
		// bookkeeping.
		lastHolidayArchiveAt: timestamp('last_holiday_archive_at'),
		// Absolute override for when this list's claimed gifts auto-reveal.
		// Set by edit-access holders via the extension control; the
		// auto-archive cron skips a list while this is in the future and the
		// deferred-due pass reveals + clears it once it elapses. Wins over the
		// derived default (eventDate + archiveDaysAfter*) even if an admin
		// later changes the archive-days settings. Null = use the derived
		// default. See .notes/logic.md "Auto-archive deferral & last-archived".
		archiveDeferUntil: timestamp('archive_defer_until'),
		// Stamped every time this list's claimed items + addons are actually
		// revealed (auto-archive cron, the deferred-due pass, or the manual
		// force-reveal). Display-only ("last archived" in list settings);
		// distinct from `lastHolidayArchiveAt`, which is holiday-occurrence
		// idempotency bookkeeping. Backfilled from `lastHolidayArchiveAt` for
		// holiday lists in migration.
		lastArchivedAt: timestamp('last_archived_at'),
		// Points at an admin-curated row in `custom_holidays`, which itself
		// contains the catalog reference or fully custom date logic. Only
		// populated for type === 'holiday'.
		customHolidayId: uuid('custom_holiday_id').references(() => customHolidays.id, { onDelete: 'set null' }),
		...timestamps,
	},
	table => [
		index('lists_ownerId_idx').on(table.ownerId),
		index('lists_ownerId_isActive_idx').on(table.ownerId, table.isActive),
		index('lists_isPrivate_isActive_idx').on(table.isPrivate, table.isActive),
		index('lists_giftIdeasTargetUserId_idx').on(table.giftIdeasTargetUserId),
		index('lists_subjectDependentId_idx').on(table.subjectDependentId),
		index('lists_giftIdeasTargetDependentId_idx').on(table.giftIdeasTargetDependentId),
		index('lists_customHolidayId_idx').on(table.customHolidayId),
	]
)

export const listsRelations = relations(lists, ({ one, many }) => ({
	owner: one(users, {
		fields: [lists.ownerId],
		references: [users.id],
		relationName: 'owner',
	}),
	subjectDependent: one(dependents, {
		fields: [lists.subjectDependentId],
		references: [dependents.id],
		relationName: 'subjectDependent',
	}),
	giftIdeasTarget: one(users, {
		fields: [lists.giftIdeasTargetUserId],
		references: [users.id],
		relationName: 'giftIdeasTarget',
	}),
	giftIdeasTargetDependent: one(dependents, {
		fields: [lists.giftIdeasTargetDependentId],
		references: [dependents.id],
		relationName: 'giftIdeasTargetDependent',
	}),
	customHoliday: one(customHolidays, {
		fields: [lists.customHolidayId],
		references: [customHolidays.id],
	}),
	itemGroups: many(itemGroups),
	items: many(items),
	addons: many(listAddons),
	editors: many(listEditors),
}))

export type List = typeof lists.$inferSelect
export type NewList = typeof lists.$inferInsert

// ===============================
// LIST ADDONS (off-list gifts)
// ===============================
// Gifts that don't correspond to an existing list item - the gifter
// volunteers they're bringing something extra. Visible only to gifters
// (spoiler protection same as claims).
export const listAddons = pgTable(
	'list_addons',
	{
		id: serial('id').primaryKey(),
		listId: integer('list_id')
			.notNull()
			.references(() => lists.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		description: text('description').notNull(),
		totalCost: numeric('total_cost'),
		notes: text('notes'),
		// Gifter-private attachments (receipt images / PDF gift receipts).
		// App caps at LIMITS.PURCHASE_ATTACHMENTS_MAX; see giftedItems.
		attachmentUrls: text('attachment_urls').array(),
		// Plain-text tracking number; UI infers carrier + builds the link.
		trackingNumber: text('tracking_number'),
		isArchived: boolean('is_archived').default(false).notNull(),
		...timestamps,
	},
	table => [index('list_addons_listId_idx').on(table.listId), index('list_addons_userId_idx').on(table.userId)]
)

export const listAddonsRelations = relations(listAddons, ({ one }) => ({
	list: one(lists, {
		fields: [listAddons.listId],
		references: [lists.id],
	}),
	user: one(users, {
		fields: [listAddons.userId],
		references: [users.id],
	}),
}))

export type ListAddon = typeof listAddons.$inferSelect
export type NewListAddon = typeof listAddons.$inferInsert
