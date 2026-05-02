import {
	appSettings,
	dependentGuardianships,
	dependents,
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

// Order used for inserts during import. Every referenced row must appear
// before any row that references it. users is written twice: once with
// partnerId=null, then again in a second pass to set partnerId.
export const BACKUP_TABLES = [
	{ name: 'users', table: users, idSequence: null },
	{ name: 'appSettings', table: appSettings, idSequence: null },
	{ name: 'userRelationships', table: userRelationships, idSequence: null },
	{ name: 'guardianships', table: guardianships, idSequence: null },
	{ name: 'dependents', table: dependents, idSequence: null },
	{ name: 'dependentGuardianships', table: dependentGuardianships, idSequence: null },
	{ name: 'lists', table: lists, idSequence: 'lists_id_seq' },
	{ name: 'itemGroups', table: itemGroups, idSequence: 'item_groups_id_seq' },
	{ name: 'items', table: items, idSequence: 'items_id_seq' },
	{ name: 'giftedItems', table: giftedItems, idSequence: 'gifted_items_id_seq' },
	{ name: 'itemComments', table: itemComments, idSequence: 'item_comments_id_seq' },
	{ name: 'listAddons', table: listAddons, idSequence: 'list_addons_id_seq' },
	{ name: 'listEditors', table: listEditors, idSequence: 'list_editors_id_seq' },
] as const

export type BackupTableName = (typeof BACKUP_TABLES)[number]['name']

// Reverse dependency order for DELETE during wipe. Children first.
export const BACKUP_TABLES_DELETE_ORDER = [
	listEditors,
	listAddons,
	itemComments,
	giftedItems,
	items,
	itemGroups,
	lists,
	dependentGuardianships,
	dependents,
	guardianships,
	userRelationships,
	appSettings,
] as const
