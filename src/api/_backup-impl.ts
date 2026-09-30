// Server-only backup export / restore implementations. Lives in a separate
// file from `backup.ts` so the restore body can run against a caller-owned
// transaction (integration tests drive it inside `withRollback`) and so
// server-only static imports stay out of the client bundle.
//
// The admin guardrails (wipe confirmation phrase, current-admin check,
// pre-wipe snapshot) stay in the server fn; this module assumes they passed.

import { eq, getTableName, sql } from 'drizzle-orm'

import { db, type SchemaDatabase } from '@/db'
import {
	appSettings,
	customHolidayReminderLogs,
	customHolidays,
	dependentGuardianships,
	dependents,
	giftContributions,
	giftedItems,
	guardianships,
	itemComments,
	itemGroups,
	items,
	itemScrapeJobs,
	listAddons,
	listEditors,
	lists,
	recommendations,
	recommendationSubItemDismissals,
	todoItems,
	userRelationLabels,
	userRelationships,
	users,
} from '@/db/schema'
import type { BackupFile, BackupFileTables } from '@/lib/backup/schema'
import { BACKUP_TABLES, BACKUP_TABLES_DELETE_ORDER } from '@/lib/backup/tables'

export type ImportCounts = Record<keyof BackupFileTables, number>

export type RestoreMode = 'wipe' | 'merge'

// ===============================
// EXPORT
// ===============================

// Captures the full database state. Backs both the admin export and the
// pre-wipe snapshot (sec-review H6), so the two can't drift apart.
export async function captureFullSnapshot(dbx: SchemaDatabase = db): Promise<BackupFile> {
	const [
		usersRows,
		appSettingsRows,
		userRelationshipsRows,
		guardianshipsRows,
		dependentsRows,
		dependentGuardianshipsRows,
		userRelationLabelsRows,
		customHolidaysRows,
		customHolidayReminderLogsRows,
		recommendationsRows,
		recommendationSubItemDismissalsRows,
		listsRows,
		itemGroupsRows,
		itemsRows,
		itemScrapeJobsRows,
		todoItemsRows,
		giftedItemsRows,
		giftContributionsRows,
		itemCommentsRows,
		listAddonsRows,
		listEditorsRows,
	] = await Promise.all([
		dbx.select().from(users),
		dbx.select().from(appSettings),
		dbx.select().from(userRelationships),
		dbx.select().from(guardianships),
		dbx.select().from(dependents),
		dbx.select().from(dependentGuardianships),
		dbx.select().from(userRelationLabels),
		dbx.select().from(customHolidays),
		dbx.select().from(customHolidayReminderLogs),
		dbx.select().from(recommendations),
		dbx.select().from(recommendationSubItemDismissals),
		dbx.select().from(lists),
		dbx.select().from(itemGroups),
		dbx.select().from(items),
		dbx.select().from(itemScrapeJobs),
		dbx.select().from(todoItems),
		dbx.select().from(giftedItems),
		dbx.select().from(giftContributions),
		dbx.select().from(itemComments),
		dbx.select().from(listAddons),
		dbx.select().from(listEditors),
	])

	return {
		version: 1,
		exportedAt: new Date().toISOString(),
		tables: {
			users: usersRows,
			appSettings: appSettingsRows as BackupFile['tables']['appSettings'],
			userRelationships: userRelationshipsRows,
			guardianships: guardianshipsRows,
			dependents: dependentsRows,
			dependentGuardianships: dependentGuardianshipsRows,
			userRelationLabels: userRelationLabelsRows,
			customHolidays: customHolidaysRows,
			customHolidayReminderLogs: customHolidayReminderLogsRows,
			recommendations: recommendationsRows as BackupFile['tables']['recommendations'],
			recommendationSubItemDismissals: recommendationSubItemDismissalsRows,
			lists: listsRows,
			itemGroups: itemGroupsRows,
			items: itemsRows,
			itemScrapeJobs: itemScrapeJobsRows,
			todoItems: todoItemsRows,
			giftedItems: giftedItemsRows,
			giftContributions: giftContributionsRows,
			itemComments: itemCommentsRows,
			listAddons: listAddonsRows,
			listEditors: listEditorsRows,
		},
	}
}

// ===============================
// RESTORE
// ===============================

// Writes every table in `tables` into `tx`. `wipe` deletes the backed-up
// tables first and bulk-inserts; `merge` upserts row by row. Each upsert
// `set` lists every column the row schema carries: a column missing from a
// `set` silently keeps the live value on merge. Columns that are optional
// in the row schema (added after the table was first backed up) fall back
// to null so an older backup restores the same way in both modes.
export async function restoreBackupTablesImpl(args: {
	tx: SchemaDatabase
	mode: RestoreMode
	tables: BackupFileTables
}): Promise<ImportCounts> {
	const { tx, mode, tables } = args

	if (mode === 'wipe') {
		// DELETE children first so FK checks stay happy even if a FK is not ON DELETE CASCADE.
		for (const table of BACKUP_TABLES_DELETE_ORDER) {
			await tx.delete(table)
		}
		// Custom holidays don't cascade off users, so only clear them when
		// the file carries the table. A file written before they were
		// backed up keeps the live rows (and the lists pinned to them).
		// Their reminder logs cascade with them.
		if (tables.customHolidays !== undefined) {
			await tx.delete(customHolidays)
		}
		// users is special: cascading deletes remove sessions/accounts/verifications
		// which are intentionally not part of the backup. Everyone re-authenticates
		// after restore, including the admin doing the import.
		await tx.delete(users)
	}

	const result = emptyCounts()

	// -------- users (pass 1: partnerId=null) --------
	if (tables.users.length > 0) {
		const pass1 = tables.users.map(u => ({ ...u, partnerId: null }))
		if (mode === 'wipe') {
			await tx.insert(users).values(pass1)
		} else {
			for (const row of pass1) {
				await tx
					.insert(users)
					.values(row)
					.onConflictDoUpdate({
						target: users.id,
						set: {
							email: row.email,
							name: row.name,
							role: row.role,
							banned: row.banned,
							banReason: row.banReason,
							banExpires: row.banExpires,
							birthMonth: row.birthMonth,
							birthDay: row.birthDay,
							birthYear: row.birthYear ?? null,
							image: row.image,
							partnerId: null,
							partnerAnniversary: row.partnerAnniversary ?? null,
							emailVerified: row.emailVerified,
							createdAt: row.createdAt,
							updatedAt: row.updatedAt,
						},
					})
			}
		}
		result.users = tables.users.length
	}

	// -------- appSettings --------
	if (tables.appSettings.length > 0) {
		if (mode === 'wipe') {
			await tx.insert(appSettings).values(tables.appSettings)
		} else {
			for (const row of tables.appSettings) {
				await tx
					.insert(appSettings)
					.values(row)
					.onConflictDoUpdate({
						target: appSettings.key,
						set: { value: row.value, createdAt: row.createdAt, updatedAt: row.updatedAt },
					})
			}
		}
		result.appSettings = tables.appSettings.length
	}

	// -------- userRelationships --------
	if (tables.userRelationships.length > 0) {
		if (mode === 'wipe') {
			await tx.insert(userRelationships).values(tables.userRelationships)
		} else {
			for (const row of tables.userRelationships) {
				await tx
					.insert(userRelationships)
					.values(row)
					.onConflictDoUpdate({
						target: [userRelationships.ownerUserId, userRelationships.viewerUserId],
						set: {
							accessLevel: row.accessLevel,
							canEdit: row.canEdit,
							createdAt: row.createdAt,
							updatedAt: row.updatedAt,
						},
					})
			}
		}
		result.userRelationships = tables.userRelationships.length
	}

	// -------- guardianships --------
	if (tables.guardianships.length > 0) {
		if (mode === 'wipe') {
			await tx.insert(guardianships).values(tables.guardianships)
		} else {
			for (const row of tables.guardianships) {
				await tx
					.insert(guardianships)
					.values(row)
					.onConflictDoUpdate({
						target: [guardianships.parentUserId, guardianships.childUserId],
						set: { createdAt: row.createdAt, updatedAt: row.updatedAt },
					})
			}
		}
		result.guardianships = tables.guardianships.length
	}

	// -------- dependents --------
	if (tables.dependents.length > 0) {
		if (mode === 'wipe') {
			await tx.insert(dependents).values(tables.dependents)
		} else {
			for (const row of tables.dependents) {
				await tx
					.insert(dependents)
					.values(row)
					.onConflictDoUpdate({
						target: dependents.id,
						set: {
							name: row.name,
							image: row.image,
							birthMonth: row.birthMonth,
							birthDay: row.birthDay,
							birthYear: row.birthYear,
							createdByUserId: row.createdByUserId,
							isArchived: row.isArchived,
							createdAt: row.createdAt,
							updatedAt: row.updatedAt,
						},
					})
			}
		}
		result.dependents = tables.dependents.length
	}

	// -------- dependentGuardianships --------
	if (tables.dependentGuardianships.length > 0) {
		if (mode === 'wipe') {
			await tx.insert(dependentGuardianships).values(tables.dependentGuardianships)
		} else {
			for (const row of tables.dependentGuardianships) {
				await tx
					.insert(dependentGuardianships)
					.values(row)
					.onConflictDoUpdate({
						target: [dependentGuardianships.guardianUserId, dependentGuardianships.dependentId],
						set: { createdAt: row.createdAt, updatedAt: row.updatedAt },
					})
			}
		}
		result.dependentGuardianships = tables.dependentGuardianships.length
	}

	// -------- userRelationLabels --------
	// Mother's / Father's Day annotations. They cascade off users, so a
	// wipe clears them; without this block a wipe-restore silently drops
	// every label and the relationship-reminder families go quiet.
	if (tables.userRelationLabels.length > 0) {
		if (mode === 'wipe') {
			await tx.insert(userRelationLabels).values(tables.userRelationLabels)
		} else {
			for (const row of tables.userRelationLabels) {
				await tx
					.insert(userRelationLabels)
					.values(row)
					.onConflictDoUpdate({
						target: userRelationLabels.id,
						set: {
							userId: row.userId,
							label: row.label,
							targetUserId: row.targetUserId,
							targetDependentId: row.targetDependentId,
							createdAt: row.createdAt,
							updatedAt: row.updatedAt,
						},
					})
			}
		}
		result.userRelationLabels = tables.userRelationLabels.length
	}

	// -------- customHolidays --------
	// Must precede lists (lists.customHolidayId). Recipients reference
	// users + dependents, which are already in place.
	if (tables.customHolidays && tables.customHolidays.length > 0) {
		if (mode === 'wipe') {
			await tx.insert(customHolidays).values(tables.customHolidays)
		} else {
			for (const row of tables.customHolidays) {
				await tx
					.insert(customHolidays)
					.values(row)
					.onConflictDoUpdate({
						target: customHolidays.id,
						set: {
							title: row.title,
							source: row.source,
							catalogCountry: row.catalogCountry,
							catalogKey: row.catalogKey,
							customMonth: row.customMonth,
							customDay: row.customDay,
							customYear: row.customYear,
							recipientUserId: row.recipientUserId,
							recipientDependentId: row.recipientDependentId,
							iconKey: row.iconKey,
							createdAt: row.createdAt,
							updatedAt: row.updatedAt,
						},
					})
			}
		}
		result.customHolidays = tables.customHolidays.length
	}

	// -------- customHolidayReminderLogs --------
	// Idempotency for the pre-holiday reminder. Restoring it keeps a
	// restore on a reminder day from mailing everyone a second time.
	if (tables.customHolidayReminderLogs.length > 0) {
		if (mode === 'wipe') {
			await tx.insert(customHolidayReminderLogs).values(tables.customHolidayReminderLogs)
		} else {
			for (const row of tables.customHolidayReminderLogs) {
				await tx
					.insert(customHolidayReminderLogs)
					.values(row)
					.onConflictDoUpdate({
						target: customHolidayReminderLogs.id,
						set: {
							customHolidayId: row.customHolidayId,
							occurrenceYear: row.occurrenceYear,
							createdAt: row.createdAt,
							updatedAt: row.updatedAt,
						},
					})
			}
		}
		result.customHolidayReminderLogs = tables.customHolidayReminderLogs.length
	}

	// -------- recommendations --------
	// Restored for their dismissed / applied status, which the runner
	// carries forward to regenerated recs by fingerprint. Without them a
	// restore re-surfaces every suggestion a user already dealt with.
	if (tables.recommendations.length > 0) {
		if (mode === 'wipe') {
			await tx.insert(recommendations).values(tables.recommendations)
		} else {
			for (const row of tables.recommendations) {
				await tx
					.insert(recommendations)
					.values(row)
					.onConflictDoUpdate({
						target: recommendations.id,
						set: {
							userId: row.userId,
							dependentId: row.dependentId,
							batchId: row.batchId,
							analyzerId: row.analyzerId,
							kind: row.kind,
							fingerprint: row.fingerprint,
							status: row.status,
							severity: row.severity,
							title: row.title,
							body: row.body,
							payload: row.payload,
							createdAt: row.createdAt,
							dismissedAt: row.dismissedAt,
						},
					})
			}
		}
		result.recommendations = tables.recommendations.length
	}

	// -------- recommendationSubItemDismissals --------
	if (tables.recommendationSubItemDismissals.length > 0) {
		if (mode === 'wipe') {
			await tx.insert(recommendationSubItemDismissals).values(tables.recommendationSubItemDismissals)
		} else {
			for (const row of tables.recommendationSubItemDismissals) {
				await tx
					.insert(recommendationSubItemDismissals)
					.values(row)
					.onConflictDoUpdate({
						target: [
							recommendationSubItemDismissals.userId,
							recommendationSubItemDismissals.fingerprint,
							recommendationSubItemDismissals.subItemId,
						],
						set: { dismissedAt: row.dismissedAt },
					})
			}
		}
		result.recommendationSubItemDismissals = tables.recommendationSubItemDismissals.length
	}

	// -------- lists --------
	if (tables.lists.length > 0) {
		// A list can point at a custom holiday the target DB doesn't have
		// (a file written before holidays were backed up, restored into a
		// different deployment). Null the pin rather than failing the whole
		// import on the FK: the same state ON DELETE SET NULL produces when
		// an admin deletes a holiday.
		const holidayIds = new Set((await tx.select({ id: customHolidays.id }).from(customHolidays)).map(h => h.id))
		const listRows = tables.lists.map(l => (l.customHolidayId && !holidayIds.has(l.customHolidayId) ? { ...l, customHolidayId: null } : l))
		if (mode === 'wipe') {
			await tx.insert(lists).values(listRows)
		} else {
			for (const row of listRows) {
				await tx
					.insert(lists)
					.values(row)
					.onConflictDoUpdate({
						target: lists.id,
						set: {
							name: row.name,
							type: row.type,
							isActive: row.isActive,
							isPrivate: row.isPrivate,
							isPrimary: row.isPrimary,
							description: row.description,
							ownerId: row.ownerId,
							subjectDependentId: row.subjectDependentId,
							giftIdeasTargetUserId: row.giftIdeasTargetUserId,
							giftIdeasTargetDependentId: row.giftIdeasTargetDependentId,
							lastHolidayArchiveAt: row.lastHolidayArchiveAt ?? null,
							archiveDeferUntil: row.archiveDeferUntil ?? null,
							lastArchivedAt: row.lastArchivedAt ?? null,
							customHolidayId: row.customHolidayId ?? null,
							createdAt: row.createdAt,
							updatedAt: row.updatedAt,
						},
					})
			}
		}
		result.lists = tables.lists.length
	}

	// -------- itemGroups --------
	if (tables.itemGroups.length > 0) {
		if (mode === 'wipe') {
			await tx.insert(itemGroups).values(tables.itemGroups)
		} else {
			for (const row of tables.itemGroups) {
				await tx
					.insert(itemGroups)
					.values(row)
					.onConflictDoUpdate({
						target: itemGroups.id,
						set: {
							listId: row.listId,
							type: row.type,
							priority: row.priority,
							name: row.name,
							sortOrder: row.sortOrder,
							createdAt: row.createdAt,
							updatedAt: row.updatedAt,
						},
					})
			}
		}
		result.itemGroups = tables.itemGroups.length
	}

	// -------- items --------
	if (tables.items.length > 0) {
		if (mode === 'wipe') {
			await tx.insert(items).values(tables.items)
		} else {
			for (const row of tables.items) {
				await tx
					.insert(items)
					.values(row)
					.onConflictDoUpdate({
						target: items.id,
						set: {
							listId: row.listId,
							groupId: row.groupId,
							title: row.title,
							status: row.status,
							availability: row.availability,
							availabilityChangedAt: row.availabilityChangedAt,
							url: row.url,
							vendorId: row.vendorId ?? null,
							vendorSource: row.vendorSource ?? null,
							imageUrl: row.imageUrl,
							price: row.price,
							currency: row.currency,
							notes: row.notes,
							ratingValue: row.ratingValue ?? null,
							ratingCount: row.ratingCount ?? null,
							priority: row.priority,
							isArchived: row.isArchived,
							archivedAt: row.archivedAt ?? null,
							pendingDeletionAt: row.pendingDeletionAt ?? null,
							quantity: row.quantity,
							groupSortOrder: row.groupSortOrder,
							sortOrder: row.sortOrder,
							modifiedAt: row.modifiedAt,
							createdAt: row.createdAt,
							updatedAt: row.updatedAt,
						},
					})
			}
		}
		result.items = tables.items.length
	}

	// -------- itemScrapeJobs --------
	// Queued enrichment for bulk-imported items. A job exported mid-run
	// comes back as pending: the worker that held it isn't part of the
	// restored deployment, and nothing else ever resets a 'running' row.
	if (tables.itemScrapeJobs.length > 0) {
		const jobRows = tables.itemScrapeJobs.map(j => (j.status === 'running' ? { ...j, status: 'pending' as const } : j))
		if (mode === 'wipe') {
			await tx.insert(itemScrapeJobs).values(jobRows)
		} else {
			for (const row of jobRows) {
				await tx
					.insert(itemScrapeJobs)
					.values(row)
					.onConflictDoUpdate({
						target: itemScrapeJobs.id,
						set: {
							itemId: row.itemId,
							userId: row.userId,
							url: row.url,
							status: row.status,
							attempts: row.attempts,
							lastError: row.lastError,
							nextAttemptAt: row.nextAttemptAt,
							enqueuedAt: row.enqueuedAt,
							completedAt: row.completedAt,
						},
					})
			}
		}
		result.itemScrapeJobs = tables.itemScrapeJobs.length
	}

	// -------- todoItems --------
	// Distinct from `items`: todo lists store rows in their own
	// table with a leaner shape (title/notes/priority/claim +
	// timestamps). A v1 import or older backup file may carry
	// none, which the schema default ([]) handles.
	if (tables.todoItems.length > 0) {
		if (mode === 'wipe') {
			await tx.insert(todoItems).values(tables.todoItems)
		} else {
			for (const row of tables.todoItems) {
				await tx
					.insert(todoItems)
					.values(row)
					.onConflictDoUpdate({
						target: todoItems.id,
						set: {
							listId: row.listId,
							title: row.title,
							notes: row.notes,
							priority: row.priority,
							claimedByUserId: row.claimedByUserId,
							claimedAt: row.claimedAt,
							sortOrder: row.sortOrder,
							createdAt: row.createdAt,
							updatedAt: row.updatedAt,
						},
					})
			}
		}
		result.todoItems = tables.todoItems.length
	}

	// -------- giftedItems --------
	if (tables.giftedItems.length > 0) {
		if (mode === 'wipe') {
			await tx.insert(giftedItems).values(tables.giftedItems)
		} else {
			for (const row of tables.giftedItems) {
				await tx
					.insert(giftedItems)
					.values(row)
					.onConflictDoUpdate({
						target: giftedItems.id,
						set: {
							itemId: row.itemId,
							gifterId: row.gifterId,
							additionalGifterIds: row.additionalGifterIds,
							quantity: row.quantity,
							totalCost: row.totalCost,
							notes: row.notes,
							attachmentUrls: row.attachmentUrls ?? null,
							trackingNumber: row.trackingNumber ?? null,
							orphanReminderSentAt: row.orphanReminderSentAt ?? null,
							createdAt: row.createdAt,
							updatedAt: row.updatedAt,
						},
					})
			}
		}
		result.giftedItems = tables.giftedItems.length
	}

	// -------- giftContributions --------
	// Custom per-gifter split overrides on a claim. FK to
	// gifted_items + users; a wipe cascade-deletes these, so they
	// must be re-inserted here or splits silently revert to even.
	if (tables.giftContributions.length > 0) {
		if (mode === 'wipe') {
			await tx.insert(giftContributions).values(tables.giftContributions)
		} else {
			for (const row of tables.giftContributions) {
				await tx
					.insert(giftContributions)
					.values(row)
					.onConflictDoUpdate({
						target: giftContributions.id,
						set: {
							giftId: row.giftId,
							userId: row.userId,
							amount: row.amount,
							createdAt: row.createdAt,
							updatedAt: row.updatedAt,
						},
					})
			}
		}
		result.giftContributions = tables.giftContributions.length
	}

	// -------- itemComments --------
	if (tables.itemComments.length > 0) {
		if (mode === 'wipe') {
			await tx.insert(itemComments).values(tables.itemComments)
		} else {
			for (const row of tables.itemComments) {
				await tx
					.insert(itemComments)
					.values(row)
					.onConflictDoUpdate({
						target: itemComments.id,
						set: {
							itemId: row.itemId,
							userId: row.userId,
							comment: row.comment,
							createdAt: row.createdAt,
							updatedAt: row.updatedAt,
						},
					})
			}
		}
		result.itemComments = tables.itemComments.length
	}

	// -------- listAddons --------
	if (tables.listAddons.length > 0) {
		if (mode === 'wipe') {
			await tx.insert(listAddons).values(tables.listAddons)
		} else {
			for (const row of tables.listAddons) {
				await tx
					.insert(listAddons)
					.values(row)
					.onConflictDoUpdate({
						target: listAddons.id,
						set: {
							listId: row.listId,
							userId: row.userId,
							description: row.description,
							totalCost: row.totalCost,
							notes: row.notes,
							url: row.url ?? null,
							imageUrl: row.imageUrl ?? null,
							attachmentUrls: row.attachmentUrls ?? null,
							trackingNumber: row.trackingNumber ?? null,
							isArchived: row.isArchived,
							createdAt: row.createdAt,
							updatedAt: row.updatedAt,
						},
					})
			}
		}
		result.listAddons = tables.listAddons.length
	}

	// -------- listEditors --------
	if (tables.listEditors.length > 0) {
		if (mode === 'wipe') {
			await tx.insert(listEditors).values(tables.listEditors)
		} else {
			for (const row of tables.listEditors) {
				await tx
					.insert(listEditors)
					.values(row)
					.onConflictDoUpdate({
						target: listEditors.id,
						set: {
							listId: row.listId,
							userId: row.userId,
							ownerId: row.ownerId,
							createdAt: row.createdAt,
							updatedAt: row.updatedAt,
						},
					})
			}
		}
		result.listEditors = tables.listEditors.length
	}

	// -------- users pass 2: set partnerId where non-null --------
	// updatedAt is written explicitly: the column's $onUpdate would
	// otherwise stamp now() over the restored value.
	for (const u of tables.users) {
		if (u.partnerId) {
			await tx.update(users).set({ partnerId: u.partnerId, updatedAt: u.updatedAt }).where(eq(users.id, u.id))
		}
	}

	// -------- reset sequences so app-side inserts don't collide --------
	for (const entry of BACKUP_TABLES) {
		if (!entry.idSequence) continue
		await tx.execute(
			sql.raw(
				`SELECT setval('${entry.idSequence}', GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${quoteIdent(getTableName(entry.table))}), 1))`
			)
		)
	}

	return result
}

export function countsFromTables(tables: BackupFileTables): ImportCounts {
	return Object.fromEntries(BACKUP_TABLES.map(({ name }) => [name, tables[name]?.length ?? 0])) as ImportCounts
}

function emptyCounts(): ImportCounts {
	return Object.fromEntries(BACKUP_TABLES.map(({ name }) => [name, 0])) as ImportCounts
}

function quoteIdent(name: string): string {
	return `"${name.replace(/"/g, '""')}"`
}
