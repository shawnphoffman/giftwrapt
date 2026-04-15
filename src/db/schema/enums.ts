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

export const listTypeEnumValues = ['wishlist', 'todo', 'giftideas'] as const
export const ListTypes: Record<(typeof listTypeEnumValues)[number], string> = {
	wishlist: 'Wish List',
	todo: 'ToDo',
	giftideas: 'Gift Ideas',
} as const
export const listTypeEnum = pgEnum('list_type', listTypeEnumValues)
export type ListType = (typeof listTypeEnumValues)[number]

export const roleEnumValues = ['user', 'admin', 'child'] as const
export const roleEnum = pgEnum('role', roleEnumValues)
export type Role = (typeof roleEnumValues)[number]
