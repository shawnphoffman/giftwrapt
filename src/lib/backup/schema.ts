import { z } from 'zod'

import {
	accessLevelEnumValues,
	availabilityEnumValues,
	birthMonthEnumValues,
	groupTypeEnumValues,
	listTypeEnumValues,
	priorityEnumValues,
	roleEnumValues,
	statusEnumValues,
} from '@/db/schema/enums'

// Dates arrive as ISO strings from JSON; coerce back to Date for Drizzle.
const dateField = z.coerce.date()

const userRowSchema = z.object({
	id: z.string(),
	email: z.string(),
	name: z.string().nullable(),
	role: z.enum(roleEnumValues),
	banned: z.boolean(),
	banReason: z.string().nullable(),
	banExpires: dateField.nullable(),
	birthMonth: z.enum(birthMonthEnumValues).nullable(),
	birthDay: z.number().int().nullable(),
	image: z.string().nullable(),
	partnerId: z.string().nullable(),
	updatedAt: dateField,
	createdAt: dateField,
	emailVerified: z.boolean(),
})

const appSettingRowSchema = z.object({
	key: z.string(),
	// Matches drizzle's jsonb().notNull() select type, which the tanstack
	// serverFn serializer narrows via NonNullable<unknown> = {}.
	value: z.any() as unknown as z.ZodType<NonNullable<unknown>>,
	updatedAt: dateField,
	createdAt: dateField,
})

const userRelationshipRowSchema = z.object({
	ownerUserId: z.string(),
	viewerUserId: z.string(),
	accessLevel: z.enum(accessLevelEnumValues),
	canEdit: z.boolean(),
	updatedAt: dateField,
	createdAt: dateField,
})

const guardianshipRowSchema = z.object({
	parentUserId: z.string(),
	childUserId: z.string(),
	updatedAt: dateField,
	createdAt: dateField,
})

const listRowSchema = z.object({
	id: z.number().int(),
	name: z.string(),
	type: z.enum(listTypeEnumValues),
	isActive: z.boolean(),
	isPrivate: z.boolean(),
	isPrimary: z.boolean(),
	description: z.string().nullable(),
	ownerId: z.string(),
	subjectDependentId: z.string().nullable(),
	giftIdeasTargetUserId: z.string().nullable(),
	giftIdeasTargetDependentId: z.string().nullable(),
	updatedAt: dateField,
	createdAt: dateField,
})

const dependentRowSchema = z.object({
	id: z.string(),
	name: z.string(),
	image: z.string().nullable(),
	birthMonth: z.enum(birthMonthEnumValues).nullable(),
	birthDay: z.number().int().nullable(),
	birthYear: z.number().int().nullable(),
	createdByUserId: z.string(),
	isArchived: z.boolean(),
	updatedAt: dateField,
	createdAt: dateField,
})

const dependentGuardianshipRowSchema = z.object({
	guardianUserId: z.string(),
	dependentId: z.string(),
	updatedAt: dateField,
	createdAt: dateField,
})

const itemGroupRowSchema = z.object({
	id: z.number().int(),
	listId: z.number().int(),
	type: z.enum(groupTypeEnumValues),
	priority: z.enum(priorityEnumValues),
	name: z.string().nullable(),
	sortOrder: z.number().int().nullable(),
	updatedAt: dateField,
	createdAt: dateField,
})

const itemRowSchema = z.object({
	id: z.number().int(),
	listId: z.number().int(),
	groupId: z.number().int().nullable(),
	title: z.string(),
	status: z.enum(statusEnumValues),
	availability: z.enum(availabilityEnumValues),
	availabilityChangedAt: dateField.nullable(),
	url: z.string().nullable(),
	imageUrl: z.string().nullable(),
	price: z.string().nullable(),
	currency: z.string().nullable(),
	notes: z.string().nullable(),
	priority: z.enum(priorityEnumValues),
	isArchived: z.boolean(),
	quantity: z.number().int(),
	groupSortOrder: z.number().int().nullable(),
	sortOrder: z.number().int().nullable(),
	updatedAt: dateField,
	createdAt: dateField,
	modifiedAt: dateField.nullable(),
})

const giftedItemRowSchema = z.object({
	id: z.number().int(),
	itemId: z.number().int(),
	gifterId: z.string(),
	additionalGifterIds: z.array(z.string()).nullable(),
	quantity: z.number().int().positive(),
	totalCost: z.string().nullable(),
	notes: z.string().nullable(),
	updatedAt: dateField,
	createdAt: dateField,
})

const itemCommentRowSchema = z.object({
	id: z.number().int(),
	itemId: z.number().int(),
	userId: z.string(),
	comment: z.string(),
	updatedAt: dateField,
	createdAt: dateField,
})

const listAddonRowSchema = z.object({
	id: z.number().int(),
	listId: z.number().int(),
	userId: z.string(),
	description: z.string(),
	totalCost: z.string().nullable(),
	notes: z.string().nullable(),
	isArchived: z.boolean(),
	updatedAt: dateField,
	createdAt: dateField,
})

const listEditorRowSchema = z.object({
	id: z.number().int(),
	listId: z.number().int(),
	userId: z.string(),
	ownerId: z.string(),
	updatedAt: dateField,
	createdAt: dateField,
})

export const BackupFileSchema = z.object({
	version: z.literal(1),
	exportedAt: z.string(),
	tables: z.object({
		users: z.array(userRowSchema),
		appSettings: z.array(appSettingRowSchema),
		userRelationships: z.array(userRelationshipRowSchema),
		guardianships: z.array(guardianshipRowSchema),
		dependents: z.array(dependentRowSchema).default([]),
		dependentGuardianships: z.array(dependentGuardianshipRowSchema).default([]),
		lists: z.array(listRowSchema),
		itemGroups: z.array(itemGroupRowSchema),
		items: z.array(itemRowSchema),
		giftedItems: z.array(giftedItemRowSchema),
		itemComments: z.array(itemCommentRowSchema),
		listAddons: z.array(listAddonRowSchema),
		listEditors: z.array(listEditorRowSchema),
	}),
})

export type BackupFile = z.infer<typeof BackupFileSchema>
export type BackupFileTables = BackupFile['tables']

// Confirmation phrase the server requires when `mode === 'wipe'`. The
// import-data UI prompts the admin to type this string into a text box;
// the server re-validates it as a defense against accidental, replayed,
// or forged wipe calls bypassing the UI. See sec-review H6.
export const WIPE_CONFIRM_PHRASE = 'WIPE AND RESTORE'

export const BackupImportInputSchema = z.object({
	mode: z.enum(['wipe', 'merge']),
	data: BackupFileSchema,
	// Required when `mode === 'wipe'`. Must equal `WIPE_CONFIRM_PHRASE`.
	// Validated in the handler so the schema itself stays simple to share.
	confirmWipe: z.string().optional(),
	// Set true to allow a wipe when storage isn't configured (and so
	// the server can't write a pre-wipe snapshot). Otherwise the wipe is
	// refused. See sec-review H6.
	confirmSkipSnapshot: z.boolean().optional(),
})
