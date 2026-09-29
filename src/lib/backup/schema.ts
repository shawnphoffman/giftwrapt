import { z } from 'zod'

import type { CustomHoliday } from '@/db/schema/custom-holidays'
import {
	accessLevelEnumValues,
	availabilityEnumValues,
	birthMonthEnumValues,
	groupTypeEnumValues,
	listTypeEnumValues,
	priorityEnumValues,
	relationLabelEnumValues,
	roleEnumValues,
	statusEnumValues,
} from '@/db/schema/enums'
import type { Recommendation } from '@/db/schema/intelligence'
import type { ItemScrapeJob } from '@/db/schema/items'

// Dates arrive as ISO strings from JSON; coerce back to Date for Drizzle.
const dateField = z.coerce.date()

// Row schemas are plain z.object, which strips unknown keys: a column the
// schema doesn't list is silently dropped on restore. Every column added
// after a table's backup schema was first written is `.optional()` so
// backups taken before the column existed still restore (the column then
// takes its DB default). `src/lib/backup/__tests__/coverage.test.ts` fails
// when a Drizzle column is neither listed here nor in
// BACKUP_OMITTED_COLUMNS (tables.ts).

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
	birthYear: z.number().int().nullable().optional(),
	image: z.string().nullable(),
	partnerId: z.string().nullable(),
	partnerAnniversary: z.string().nullable().optional(),
	// `twoFactorEnabled` is deliberately NOT backed up. The TOTP secret
	// lives in the better-auth `twoFactor` table, which (like sessions,
	// accounts, and passkeys) is never exported. Restoring the flag
	// without the secret would route the user into a 2FA challenge they
	// can never pass; a wipe-restore leaves it at its default (false) and
	// a merge leaves the live value alone.
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
	lastHolidayArchiveAt: dateField.nullable().optional(),
	archiveDeferUntil: dateField.nullable().optional(),
	lastArchivedAt: dateField.nullable().optional(),
	customHolidayId: z.string().nullable().optional(),
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
	vendorId: z.string().nullable().optional(),
	vendorSource: z.string().nullable().optional(),
	imageUrl: z.string().nullable(),
	price: z.string().nullable(),
	currency: z.string().nullable(),
	notes: z.string().nullable(),
	ratingValue: z.number().nullable().optional(),
	ratingCount: z.number().int().nullable().optional(),
	priority: z.enum(priorityEnumValues),
	isArchived: z.boolean(),
	pendingDeletionAt: dateField.nullable().optional(),
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
	attachmentUrls: z.array(z.string()).nullable().optional(),
	trackingNumber: z.string().nullable().optional(),
	orphanReminderSentAt: dateField.nullable().optional(),
	updatedAt: dateField,
	createdAt: dateField,
})

const giftContributionRowSchema = z.object({
	id: z.number().int(),
	giftId: z.number().int(),
	userId: z.string(),
	amount: z.string(),
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
	// Optional so backups taken before these columns existed still restore.
	url: z.string().nullable().optional(),
	imageUrl: z.string().nullable().optional(),
	attachmentUrls: z.array(z.string()).nullable().optional(),
	trackingNumber: z.string().nullable().optional(),
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

const todoItemRowSchema = z.object({
	id: z.number().int(),
	listId: z.number().int(),
	title: z.string(),
	notes: z.string().nullable(),
	priority: z.enum(priorityEnumValues),
	claimedByUserId: z.string().nullable(),
	claimedAt: dateField.nullable(),
	sortOrder: z.number().int().nullable(),
	updatedAt: dateField,
	createdAt: dateField,
})

const userRelationLabelRowSchema = z.object({
	id: z.number().int(),
	userId: z.string(),
	label: z.enum(relationLabelEnumValues),
	targetUserId: z.string().nullable(),
	targetDependentId: z.string().nullable(),
	updatedAt: dateField,
	createdAt: dateField,
})

// Mirrors `customHolidaySourceEnum`. Spelled out (type-checked against the
// row type) so this client-shared module doesn't pull the whole Drizzle
// table graph into the browser bundle via custom-holidays.ts.
const customHolidaySourceValues = ['catalog', 'custom'] as const satisfies ReadonlyArray<CustomHoliday['source']>

const customHolidayRowSchema = z.object({
	id: z.string(),
	title: z.string(),
	source: z.enum(customHolidaySourceValues),
	catalogCountry: z.string().nullable(),
	catalogKey: z.string().nullable(),
	customMonth: z.number().int().nullable(),
	customDay: z.number().int().nullable(),
	customYear: z.number().int().nullable(),
	recipientUserId: z.string().nullable(),
	recipientDependentId: z.string().nullable(),
	iconKey: z.string().nullable(),
	updatedAt: dateField,
	createdAt: dateField,
})

const customHolidayReminderLogRowSchema = z.object({
	id: z.string(),
	customHolidayId: z.string(),
	occurrenceYear: z.number().int(),
	updatedAt: dateField,
	createdAt: dateField,
})

// Enum values spelled out for the same bundle reason as
// customHolidaySourceValues above.
const recommendationStatusValues = ['active', 'dismissed', 'applied'] as const satisfies ReadonlyArray<Recommendation['status']>
const recommendationSeverityValues = ['info', 'suggest', 'important'] as const satisfies ReadonlyArray<Recommendation['severity']>

// Backed up for the dismissed / applied status: the runner carries it
// forward to regenerated recs by fingerprint, so without these rows a
// restore re-surfaces every suggestion a user already dealt with.
const recommendationRowSchema = z.object({
	id: z.string(),
	userId: z.string(),
	dependentId: z.string().nullable(),
	batchId: z.string(),
	analyzerId: z.string(),
	kind: z.string(),
	fingerprint: z.string(),
	status: z.enum(recommendationStatusValues),
	severity: z.enum(recommendationSeverityValues),
	title: z.string(),
	body: z.string(),
	// See appSettingRowSchema.value for the cast.
	payload: z.any() as unknown as z.ZodType<NonNullable<unknown>>,
	createdAt: dateField,
	dismissedAt: dateField.nullable(),
})

const recommendationSubItemDismissalRowSchema = z.object({
	userId: z.string(),
	fingerprint: z.string(),
	subItemId: z.string(),
	dismissedAt: dateField,
})

const itemScrapeJobStatusValues = ['pending', 'running', 'success', 'failed'] as const satisfies ReadonlyArray<ItemScrapeJob['status']>

// Queued enrichment for bulk-imported items. Without it a restore strands
// items that were still waiting on their scrape.
const itemScrapeJobRowSchema = z.object({
	id: z.number().int(),
	itemId: z.number().int(),
	userId: z.string().nullable(),
	url: z.string(),
	status: z.enum(itemScrapeJobStatusValues),
	attempts: z.number().int(),
	lastError: z.string().nullable(),
	nextAttemptAt: dateField,
	enqueuedAt: dateField,
	completedAt: dateField.nullable(),
})

// Row schema per backed-up table, keyed like `BACKUP_TABLES` names. The
// coverage test diffs each against its Drizzle table's columns.
export const BACKUP_ROW_SCHEMAS = {
	users: userRowSchema,
	appSettings: appSettingRowSchema,
	userRelationships: userRelationshipRowSchema,
	guardianships: guardianshipRowSchema,
	dependents: dependentRowSchema,
	dependentGuardianships: dependentGuardianshipRowSchema,
	userRelationLabels: userRelationLabelRowSchema,
	customHolidays: customHolidayRowSchema,
	customHolidayReminderLogs: customHolidayReminderLogRowSchema,
	recommendations: recommendationRowSchema,
	recommendationSubItemDismissals: recommendationSubItemDismissalRowSchema,
	lists: listRowSchema,
	itemGroups: itemGroupRowSchema,
	items: itemRowSchema,
	itemScrapeJobs: itemScrapeJobRowSchema,
	todoItems: todoItemRowSchema,
	giftedItems: giftedItemRowSchema,
	giftContributions: giftContributionRowSchema,
	itemComments: itemCommentRowSchema,
	listAddons: listAddonRowSchema,
	listEditors: listEditorRowSchema,
} as const

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
		// Defaulted: relation labels cascade off users, so a wipe clears
		// them whether or not the file carries any.
		userRelationLabels: z.array(userRelationLabelRowSchema).default([]),
		// Deliberately NOT defaulted. Custom holidays don't cascade off
		// users, so a wipe only clears them when the file carries the key;
		// restoring a file written before they were backed up keeps the
		// live holidays (and the lists pinned to them) instead of silently
		// deleting both.
		customHolidays: z.array(customHolidayRowSchema).optional(),
		// The rest of these were added to the backup together; defaulted
		// so older files import with an empty array. Reminder logs and
		// recommendation state cascade off holidays / users, so a wipe
		// clears them either way.
		customHolidayReminderLogs: z.array(customHolidayReminderLogRowSchema).default([]),
		recommendations: z.array(recommendationRowSchema).default([]),
		recommendationSubItemDismissals: z.array(recommendationSubItemDismissalRowSchema).default([]),
		lists: z.array(listRowSchema),
		itemGroups: z.array(itemGroupRowSchema),
		items: z.array(itemRowSchema),
		itemScrapeJobs: z.array(itemScrapeJobRowSchema).default([]),
		// Defaulted so backup files written before the todoItems table
		// existed import cleanly with an empty array.
		todoItems: z.array(todoItemRowSchema).default([]),
		giftedItems: z.array(giftedItemRowSchema),
		// Defaulted so backup files written before the giftContributions
		// table existed import cleanly with an empty array.
		giftContributions: z.array(giftContributionRowSchema).default([]),
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
