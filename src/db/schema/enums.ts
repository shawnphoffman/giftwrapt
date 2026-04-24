import { pgEnum } from 'drizzle-orm/pg-core'

export const priorityEnumValues = ['low', 'normal', 'high', 'very-high'] as const
export const priorityEnum = pgEnum('priority', priorityEnumValues)
export type Priority = (typeof priorityEnumValues)[number]

export const statusEnumValues = [
	'incomplete',
	'complete',
	// 'partial-quantity',
	// 'group-complete',
	// 'group-incomplete',
	// 'group-invalid',
] as const
export const statusEnum = pgEnum('status', statusEnumValues)
export type Status = (typeof statusEnumValues)[number]

export const availabilityEnumValues = ['available', 'unavailable'] as const
export const availabilityEnum = pgEnum('availability', availabilityEnumValues)
export type Availability = (typeof availabilityEnumValues)[number]

export const birthMonthEnumValues = [
	'january',
	'february',
	'march',
	'april',
	'may',
	'june',
	'july',
	'august',
	'september',
	'october',
	'november',
	'december',
] as const
export const birthMonthEnum = pgEnum('birth_month', birthMonthEnumValues)
export type BirthMonth = (typeof birthMonthEnumValues)[number]

export const listTypeEnumValues = ['wishlist', 'christmas', 'birthday', 'giftideas', 'todos', 'test'] as const
export const ListTypes: Record<(typeof listTypeEnumValues)[number], string> = {
	wishlist: 'Wish List',
	christmas: 'Christmas',
	birthday: 'Birthday',
	giftideas: 'Gift Ideas',
	todos: 'ToDo',
	test: 'Test',
} as const
export const listTypeEnum = pgEnum('list_type', listTypeEnumValues)
export type ListType = (typeof listTypeEnumValues)[number]

export const roleEnumValues = ['user', 'admin', 'child'] as const
export const roleEnum = pgEnum('role', roleEnumValues)
export type Role = (typeof roleEnumValues)[number]

// Item group types:
// - 'or':    "pick one of these" - claiming any item satisfies the group;
//            sibling items are no longer claimable.
// - 'order': "in this order" - items must be claimed in groupSortOrder
//            sequence (e.g. console before controllers).
export const groupTypeEnumValues = ['or', 'order'] as const
export const groupTypeEnum = pgEnum('group_type', groupTypeEnumValues)
export type GroupType = (typeof groupTypeEnumValues)[number]
