// User-declared relation labels (e.g. "this user is my mother").
//
// Why this exists: the four-axes model in `.notes/logic.md` covers
// guardianship, partnership, and dependent-guardianship but doesn't
// represent parenthood in the gift-giving sense (my mom, my dad). For
// occasion-driven flows (Mother's Day, Father's Day) we need a way for
// a user to declare "these are the people I shop for on this occasion."
//
// This table is pure annotation: `canViewList` / `canEditList` /
// `getViewerAccessLevel` never read it. Adding a row does not grant
// any access. Removing a row does not revoke any access. The labels
// drive Intelligence recs and holiday reminder emails only.
//
// Per-direction: A tagging B as "mother" does not auto-tag B as having
// A as "child" - mirrors how `userRelationships` works. If both
// directions are wanted, both rows must exist.
//
// Targets: each row points at EXACTLY ONE of `targetUserId` /
// `targetDependentId`. App-layer enforced; no DB-level CHECK.

import { relations } from 'drizzle-orm'
import { index, pgTable, serial, text } from 'drizzle-orm/pg-core'

import { dependents } from './dependents'
import { relationLabelEnum } from './enums'
import { timestamps } from './shared'
import { users } from './users'

export const userRelationLabels = pgTable(
	'user_relation_labels',
	{
		id: serial('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		label: relationLabelEnum('label').notNull(),
		targetUserId: text('target_user_id').references(() => users.id, { onDelete: 'cascade' }),
		targetDependentId: text('target_dependent_id').references(() => dependents.id, { onDelete: 'cascade' }),
		...timestamps,
	},
	table => [
		index('user_relation_labels_userId_idx').on(table.userId),
		index('user_relation_labels_targetUserId_idx').on(table.targetUserId),
		index('user_relation_labels_targetDependentId_idx').on(table.targetDependentId),
	]
)

export const userRelationLabelsRelations = relations(userRelationLabels, ({ one }) => ({
	user: one(users, {
		fields: [userRelationLabels.userId],
		references: [users.id],
		relationName: 'relationLabelsOwner',
	}),
	targetUser: one(users, {
		fields: [userRelationLabels.targetUserId],
		references: [users.id],
		relationName: 'relationLabelsTargetUser',
	}),
	targetDependent: one(dependents, {
		fields: [userRelationLabels.targetDependentId],
		references: [dependents.id],
		relationName: 'relationLabelsTargetDependent',
	}),
}))

export type UserRelationLabel = typeof userRelationLabels.$inferSelect
export type NewUserRelationLabel = typeof userRelationLabels.$inferInsert
