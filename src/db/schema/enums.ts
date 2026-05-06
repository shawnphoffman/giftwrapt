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

export const listTypeEnumValues = ['wishlist', 'christmas', 'birthday', 'giftideas', 'holiday', 'todos', 'test'] as const
export const ListTypes: Record<(typeof listTypeEnumValues)[number], string> = {
	wishlist: 'Wish List',
	christmas: 'Christmas',
	birthday: 'Birthday',
	giftideas: 'Gift Ideas',
	holiday: 'Holiday',
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

// Per-relationship access tiers stored on userRelationships.access_level.
// - 'none':       explicit deny, the prior canView=false state.
// - 'restricted': can see lists and claim, but only items unclaimed by
//                 anyone outside (viewer, viewer's partner). No list addons.
//                 Mutually exclusive with edit grants.
// - 'view':       full visibility, the prior canView=true state and the
//                 default for new rows.
export const accessLevelEnumValues = ['none', 'restricted', 'view'] as const
export const accessLevelEnum = pgEnum('access_level', accessLevelEnumValues)
export type AccessLevel = (typeof accessLevelEnumValues)[number]

// User-declared relation labels (e.g. "this user is my mother"). Pure
// annotation, no permission implications; canViewList/canEditList
// never read these. Feeds Intelligence "set your people" recs and
// holiday reminder emails for occasion-driven shopping flows.
export const relationLabelEnumValues = ['mother', 'father'] as const
export const relationLabelEnum = pgEnum('relation_label', relationLabelEnumValues)
export type RelationLabel = (typeof relationLabelEnumValues)[number]
