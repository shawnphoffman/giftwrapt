// Server-only impls for the admin Reveals page: lists that still hide
// claimed gifts or off-list gifts, and an operator "reveal this list now"
// that ignores the reveal window. It exists for gifts logged after the fact
// (a claim made after the cycle it belongs to already revealed), which would
// otherwise wait for the next cycle. See docs/logic.md "Admin per-list
// reveal".
//
// Spoiler rule: an admin never sees hidden-gift counts for a list they are
// the recipient of, and cannot reveal one. That is a list they own that is
// not made for a dependent.

import { and, count, countDistinct, eq, inArray, notInArray } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { db } from '@/db'
import { dependents, giftedItems, items, listAddons, lists, users } from '@/db/schema'
import type { ListType } from '@/db/schema/enums'
import { loadArchiveBannerInfo } from '@/lib/archive-schedule-loader'
import { sendRevealEmails } from '@/lib/cron/reveal-emails'
import { visibleItemsWhere } from '@/lib/item-visibility'
import { notifyListEvent } from '@/lib/list-event-bus'
import { itemsArchivedTotal, revealsTriggeredTotal } from '@/lib/observability/metrics'
import { revealFamilyForList, revealListPurchases } from '@/lib/reveal'
import { getAppSettings } from '@/lib/settings-loader'

// giftideas lists reveal through their owner's "Archive all purchases"
// button; todos have no claims to hide.
const EXCLUDED_TYPES: Array<ListType> = ['giftideas', 'todos']

export type HiddenPurchasesListRow = {
	listId: number
	listName: string
	listType: ListType
	recipientName: string
	recipientKind: 'user' | 'dependent'
	hiddenItemCount: number
	hiddenAddonCount: number
	// When the list reveals on its own (the edit-view badge's date), or null
	// for a list that never auto-reveals.
	scheduledRevealAt: string | null
	lastArchivedAt: string | null
}

export async function getListsWithHiddenPurchasesImpl(args: {
	adminId: string
	dbx?: SchemaDatabase
	now?: Date
}): Promise<Array<HiddenPurchasesListRow>> {
	const { adminId, dbx = db, now = new Date() } = args

	const itemCounts = await dbx
		.select({ listId: items.listId, n: countDistinct(items.id) })
		.from(items)
		.innerJoin(giftedItems, eq(giftedItems.itemId, items.id))
		.where(visibleItemsWhere('visible'))
		.groupBy(items.listId)
	const addonCounts = await dbx
		.select({ listId: listAddons.listId, n: count() })
		.from(listAddons)
		.where(eq(listAddons.isArchived, false))
		.groupBy(listAddons.listId)

	const itemsByList = new Map(itemCounts.map(r => [r.listId, Number(r.n)]))
	const addonsByList = new Map(addonCounts.map(r => [r.listId, Number(r.n)]))
	const listIds = Array.from(new Set([...itemsByList.keys(), ...addonsByList.keys()]))
	if (listIds.length === 0) return []

	const rows = await dbx
		.select({
			id: lists.id,
			name: lists.name,
			type: lists.type,
			ownerId: lists.ownerId,
			subjectDependentId: lists.subjectDependentId,
			ownerName: users.name,
			ownerEmail: users.email,
			dependentName: dependents.name,
		})
		.from(lists)
		.innerJoin(users, eq(users.id, lists.ownerId))
		.leftJoin(dependents, eq(dependents.id, lists.subjectDependentId))
		.where(and(inArray(lists.id, listIds), eq(lists.isActive, true), notInArray(lists.type, EXCLUDED_TYPES)))

	const visible = rows.filter(r => !isAdminsOwnList(adminId, r))

	const result: Array<HiddenPurchasesListRow> = []
	for (const r of visible) {
		const info = await loadArchiveBannerInfo(r.id, dbx, now)
		result.push({
			listId: r.id,
			listName: r.name,
			listType: r.type,
			recipientName: r.subjectDependentId ? (r.dependentName ?? 'Dependent') : r.ownerName || r.ownerEmail,
			recipientKind: r.subjectDependentId ? 'dependent' : 'user',
			hiddenItemCount: itemsByList.get(r.id) ?? 0,
			hiddenAddonCount: addonsByList.get(r.id) ?? 0,
			scheduledRevealAt: info.applies ? info.effectiveArchiveDate : null,
			lastArchivedAt: info.lastArchivedAt,
		})
	}
	return result.sort((a, b) => a.recipientName.localeCompare(b.recipientName) || a.listName.localeCompare(b.listName))
}

export type RevealListAsAdminResult =
	| { kind: 'ok'; updated: number; addonsArchived: number; emailSent: boolean }
	| { kind: 'error'; reason: 'not-found' | 'not-applicable' | 'own-list' }

export async function revealListAsAdminImpl(args: {
	adminId: string
	input: { listId: number; sendEmail: boolean }
	dbx?: SchemaDatabase
	now?: Date
}): Promise<RevealListAsAdminResult> {
	const { adminId, input, dbx = db, now = new Date() } = args

	const list = await dbx.query.lists.findFirst({
		where: eq(lists.id, input.listId),
		columns: { id: true, name: true, type: true, ownerId: true, subjectDependentId: true, customHolidayId: true, isActive: true },
	})
	if (!list || !list.isActive) return { kind: 'error', reason: 'not-found' }
	if (EXCLUDED_TYPES.includes(list.type)) return { kind: 'error', reason: 'not-applicable' }
	if (isAdminsOwnList(adminId, list)) return { kind: 'error', reason: 'own-list' }

	const revealed = await revealListPurchases(dbx, list.id, now)
	for (const id of revealed.itemIds) {
		notifyListEvent({ kind: 'item', listId: list.id, itemId: id })
	}
	if (revealed.itemIds.length > 0) itemsArchivedTotal.inc(revealed.itemIds.length)
	if (revealed.itemIds.length > 0 || revealed.addonIds.length > 0) revealsTriggeredTotal.inc({ trigger: 'admin' })

	let emailSent = false
	if (input.sendEmail) {
		const family = await revealFamilyForList(dbx, list)
		if (family) {
			const settings = await getAppSettings(dbx)
			const sent = await sendRevealEmails(
				dbx,
				[
					{
						listId: list.id,
						ownerId: list.ownerId,
						listName: list.name,
						subjectDependentId: list.subjectDependentId,
						...family,
						...revealed,
					},
				],
				settings
			)
			emailSent = sent > 0
		}
	}

	return { kind: 'ok', updated: revealed.itemIds.length, addonsArchived: revealed.addonIds.length, emailSent }
}

function isAdminsOwnList(adminId: string, list: { ownerId: string; subjectDependentId: string | null }): boolean {
	return list.ownerId === adminId && list.subjectDependentId == null
}
