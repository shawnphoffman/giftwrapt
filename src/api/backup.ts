import { createServerFn } from '@tanstack/react-start'
import { eq, sql } from 'drizzle-orm'

import { db } from '@/db'
import {
	appSettings,
	giftedItems,
	guardianships,
	itemComments,
	itemGroups,
	items,
	listAddons,
	listEditors,
	lists,
	userRelationships,
	users,
} from '@/db/schema'
import type { BackupFile, BackupFileTables } from '@/lib/backup/schema'
import { BackupImportInputSchema } from '@/lib/backup/schema'
import { BACKUP_TABLES, BACKUP_TABLES_DELETE_ORDER } from '@/lib/backup/tables'
import { adminAuthMiddleware } from '@/middleware/auth'

// ===============================
// EXPORT
// ===============================

export const exportAppDataAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware])
	.handler(async (): Promise<BackupFile> => {
		const [
			usersRows,
			appSettingsRows,
			userRelationshipsRows,
			guardianshipsRows,
			listsRows,
			itemGroupsRows,
			itemsRows,
			giftedItemsRows,
			itemCommentsRows,
			listAddonsRows,
			listEditorsRows,
		] = await Promise.all([
			db.select().from(users),
			db.select().from(appSettings),
			db.select().from(userRelationships),
			db.select().from(guardianships),
			db.select().from(lists),
			db.select().from(itemGroups),
			db.select().from(items),
			db.select().from(giftedItems),
			db.select().from(itemComments),
			db.select().from(listAddons),
			db.select().from(listEditors),
		])

		return {
			version: 1,
			exportedAt: new Date().toISOString(),
			tables: {
				users: usersRows,
				// Drizzle selects jsonb().notNull() as `unknown` in practice even
				// though TS 5's NonNullable<unknown> resolves to `{}`. Cast rather
				// than forcing `$type<{}>()` on the column, which would propagate
				// into every consumer of the settings reader.
				appSettings: appSettingsRows as BackupFile['tables']['appSettings'],
				userRelationships: userRelationshipsRows,
				guardianships: guardianshipsRows,
				lists: listsRows,
				itemGroups: itemGroupsRows,
				items: itemsRows,
				giftedItems: giftedItemsRows,
				itemComments: itemCommentsRows,
				listAddons: listAddonsRows,
				listEditors: listEditorsRows,
			},
		}
	})

// ===============================
// IMPORT
// ===============================

export type ImportCounts = Record<keyof BackupFileTables, number>

export type ImportBackupResult =
	| { kind: 'ok'; counts: ImportCounts }
	| { kind: 'error'; reason: 'current-admin-missing' | 'import-failed'; details?: string }

export const importAppDataAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware])
	.inputValidator((input: unknown) => BackupImportInputSchema.parse(input))
	.handler(async ({ data: input, context }): Promise<ImportBackupResult> => {
		const { mode, data } = input
		const { tables } = data
		const currentAdminId = context.session.user.id

		// Prevent the admin from wiping themselves out of existence.
		if (mode === 'wipe' && !tables.users.some(u => u.id === currentAdminId)) {
			return {
				kind: 'error',
				reason: 'current-admin-missing',
				details:
					"Your own user account is not in the backup's users table. A wipe-and-restore would lock you out, so the import was aborted. Sign in as a different admin whose account is in the backup, or switch to Merge mode.",
			}
		}

		try {
			const counts = await db.transaction(async tx => {
				if (mode === 'wipe') {
					// DELETE children first so FK checks stay happy even if a FK is not ON DELETE CASCADE.
					for (const table of BACKUP_TABLES_DELETE_ORDER) {
						await tx.delete(table)
					}
					// users is special: cascading deletes remove sessions/accounts/verifications
					// which are intentionally not part of the backup. Everyone re-authenticates
					// after restore, including the admin doing the import.
					await tx.delete(users)
				}

				const result: ImportCounts = emptyCounts()

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
										image: row.image,
										partnerId: null,
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
										canView: row.canView,
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

				// -------- lists --------
				if (tables.lists.length > 0) {
					if (mode === 'wipe') {
						await tx.insert(lists).values(tables.lists)
					} else {
						for (const row of tables.lists) {
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
										giftIdeasTargetUserId: row.giftIdeasTargetUserId,
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
										url: row.url,
										imageUrl: row.imageUrl,
										price: row.price,
										currency: row.currency,
										notes: row.notes,
										priority: row.priority,
										isArchived: row.isArchived,
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
										createdAt: row.createdAt,
										updatedAt: row.updatedAt,
									},
								})
						}
					}
					result.giftedItems = tables.giftedItems.length
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
				for (const u of tables.users) {
					if (u.partnerId) {
						await tx.update(users).set({ partnerId: u.partnerId }).where(eq(users.id, u.id))
					}
				}

				// -------- reset sequences so app-side inserts don't collide --------
				for (const entry of BACKUP_TABLES) {
					if (!entry.idSequence) continue
					await tx.execute(
						sql.raw(
							`SELECT setval('${entry.idSequence}', GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${quoteIdent(dbTableName(entry.name))}), 1))`
						)
					)
				}

				return result
			})

			return { kind: 'ok', counts }
		} catch (err) {
			return {
				kind: 'error',
				reason: 'import-failed',
				details: err instanceof Error ? err.message : String(err),
			}
		}
	})

function emptyCounts(): ImportCounts {
	return {
		users: 0,
		appSettings: 0,
		userRelationships: 0,
		guardianships: 0,
		lists: 0,
		itemGroups: 0,
		items: 0,
		giftedItems: 0,
		itemComments: 0,
		listAddons: 0,
		listEditors: 0,
	}
}

// Map backup-table name to physical table name for the sequence reset.
function dbTableName(name: keyof BackupFileTables): string {
	switch (name) {
		case 'users':
			return 'users'
		case 'appSettings':
			return 'app_settings'
		case 'userRelationships':
			return 'user_relationships'
		case 'guardianships':
			return 'guardianships'
		case 'lists':
			return 'lists'
		case 'itemGroups':
			return 'item_groups'
		case 'items':
			return 'items'
		case 'giftedItems':
			return 'gifted_items'
		case 'itemComments':
			return 'item_comments'
		case 'listAddons':
			return 'list_addons'
		case 'listEditors':
			return 'list_editors'
	}
}

function quoteIdent(name: string): string {
	return `"${name.replace(/"/g, '""')}"`
}
