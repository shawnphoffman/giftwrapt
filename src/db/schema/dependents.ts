import { relations } from 'drizzle-orm'
import { boolean, index, pgTable, primaryKey, smallint, text } from 'drizzle-orm/pg-core'
import z from 'zod'

import { LIMITS } from '@/lib/validation/limits'

import { birthMonthEnum, birthMonthEnumValues } from './enums'
import { timestamps } from './shared'
import { users } from './users'

// ===============================
// DEPENDENTS
// ===============================
// Non-user gift recipients (pets, babies, anyone with no expectation of
// autonomy in the app). Managed entirely by guardian users via
// `dependentGuardianships`. Lists can be authored "for" a dependent by
// setting `lists.subjectDependentId`; the guardians of the subject get
// the same view+edit access guardians have on a child user's lists.
//
// "Kind" (pet vs. baby vs. other) is intentionally NOT persisted: every
// dependent is the same row shape with the same UI affordances. The
// distinction only exists in copy.
export const dependents = pgTable(
	'dependents',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		image: text('image'),
		birthMonth: birthMonthEnum('birth_month'),
		birthDay: smallint('birth_day'),
		birthYear: smallint('birth_year'),
		createdByUserId: text('created_by_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		isArchived: boolean('is_archived').default(false).notNull(),
		...timestamps,
	},
	table => [index('dependents_createdByUserId_idx').on(table.createdByUserId), index('dependents_isArchived_idx').on(table.isArchived)]
)

export const DependentSchema = z.object({
	name: z.string().min(1, 'Name is required').max(LIMITS.SHORT_NAME, `Name must be ${LIMITS.SHORT_NAME} characters or fewer`),
	birthMonth: z.enum(birthMonthEnumValues).nullish(),
	birthDay: z
		.union([
			z
				.number()
				.int('Birth day must be a whole number')
				.min(1, 'Birth day must be between 1 and 31')
				.max(31, 'Birth day must be between 1 and 31'),
			z.null(),
		])
		.optional(),
	birthYear: z
		.union([
			z
				.number()
				.int('Birth year must be a whole number')
				.min(1900, 'Birth year must be between 1900 and the current year')
				.max(new Date().getFullYear(), 'Birth year must be between 1900 and the current year'),
			z.null(),
		])
		.optional(),
	image: z.string().max(LIMITS.URL).optional(),
})

// ===============================
// DEPENDENT GUARDIANSHIPS
// ===============================
// `(guardianUserId, dependentId)`. Mirrors `guardianships` but the right
// side is a dependent rather than a child user. Multiple users can share
// guardianship of a single dependent (co-parents, co-owners of a pet).
export const dependentGuardianships = pgTable(
	'dependent_guardianships',
	{
		guardianUserId: text('guardian_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		dependentId: text('dependent_id')
			.notNull()
			.references(() => dependents.id, { onDelete: 'cascade' }),
		...timestamps,
	},
	table => [
		primaryKey({ columns: [table.guardianUserId, table.dependentId] }),
		index('dependent_guardianships_dependentId_idx').on(table.dependentId),
	]
)

export const dependentsRelations = relations(dependents, ({ one, many }) => ({
	createdBy: one(users, {
		fields: [dependents.createdByUserId],
		references: [users.id],
	}),
	guardianships: many(dependentGuardianships),
}))

export const dependentGuardianshipsRelations = relations(dependentGuardianships, ({ one }) => ({
	guardian: one(users, {
		fields: [dependentGuardianships.guardianUserId],
		references: [users.id],
	}),
	dependent: one(dependents, {
		fields: [dependentGuardianships.dependentId],
		references: [dependents.id],
	}),
}))

export type Dependent = typeof dependents.$inferSelect
export type NewDependent = typeof dependents.$inferInsert
export type DependentGuardianship = typeof dependentGuardianships.$inferSelect
export type NewDependentGuardianship = typeof dependentGuardianships.$inferInsert
