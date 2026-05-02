import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { db } from '@/db'
import { dependentGuardianships, dependents, giftedItems, items, listAddons, lists, users } from '@/db/schema'
import { namesForGifter, type PartneredUser } from '@/lib/gifters'
import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

// ===============================
// READ - received gifts (archived items on user's lists)
// ===============================
// After items are archived, the recipient can see who gifted them.
// This surfaces gifter info that was hidden during spoiler protection.
// Each gifter is shown alongside their partner when one is set, matching
// the settings page promise that gifts credit both partners.

export type ReceivedGiftRow = {
	type: 'item'
	itemId: number
	itemTitle: string
	itemImageUrl: string | null
	itemPrice: string | null
	listId: number
	listName: string
	// Every person credited on the claim: primary gifter, their partner (if any),
	// each co-gifter, and each co-gifter's partner. De-duplicated display names.
	gifterNames: Array<string>
	quantity: number
	archivedAt: Date
}

export type ReceivedAddonRow = {
	type: 'addon'
	addonId: number
	description: string
	totalCost: string | null
	listId: number
	listName: string
	gifterNames: Array<string>
	archivedAt: Date
}

export type DependentReceivedSection = {
	dependent: { id: string; name: string; image: string | null }
	gifts: Array<ReceivedGiftRow>
	addons: Array<ReceivedAddonRow>
}

export type ReceivedGiftsResult = {
	gifts: Array<ReceivedGiftRow>
	addons: Array<ReceivedAddonRow>
	dependents: Array<DependentReceivedSection>
}

export async function getReceivedGiftsImpl(args: { userId: string; dbx?: SchemaDatabase }): Promise<ReceivedGiftsResult> {
	const { userId, dbx = db } = args

	// Personal received gifts: only lists I own AND that aren't FOR a
	// dependent (those collapse into the per-dependent sections below).
	const giftRows = await dbx
		.select({
			itemId: items.id,
			itemTitle: items.title,
			itemImageUrl: items.imageUrl,
			itemPrice: items.price,
			listId: lists.id,
			listName: lists.name,
			gifterId: giftedItems.gifterId,
			additionalGifterIds: giftedItems.additionalGifterIds,
			quantity: giftedItems.quantity,
			archivedAt: items.updatedAt,
			subjectDependentId: lists.subjectDependentId,
		})
		.from(giftedItems)
		.innerJoin(items, and(eq(items.id, giftedItems.itemId), eq(items.isArchived, true)))
		.innerJoin(lists, eq(lists.id, items.listId))
		.where(and(eq(lists.ownerId, userId), isNull(lists.subjectDependentId)))
		.orderBy(desc(items.updatedAt))

	const addonRows = await dbx
		.select({
			addonId: listAddons.id,
			description: listAddons.description,
			totalCost: listAddons.totalCost,
			listId: lists.id,
			listName: lists.name,
			gifterId: listAddons.userId,
			archivedAt: listAddons.createdAt,
			subjectDependentId: lists.subjectDependentId,
		})
		.from(listAddons)
		.innerJoin(lists, eq(lists.id, listAddons.listId))
		.where(and(eq(lists.ownerId, userId), eq(listAddons.isArchived, true), isNull(lists.subjectDependentId)))
		.orderBy(desc(listAddons.createdAt))

	// Per-dependent gifts: every list with a subjectDependentId that this
	// guardian is a guardian of, archived items only.
	const myDependentRows = await dbx
		.select({ dependentId: dependentGuardianships.dependentId })
		.from(dependentGuardianships)
		.where(eq(dependentGuardianships.guardianUserId, userId))
	const myDependentIds = myDependentRows.map(r => r.dependentId)

	type DependentGiftRow = {
		itemId: number
		itemTitle: string
		itemImageUrl: string | null
		itemPrice: string | null
		listId: number
		listName: string
		gifterId: string
		additionalGifterIds: Array<string> | null
		quantity: number
		archivedAt: Date
		subjectDependentId: string | null
	}
	type DependentAddonRow = {
		addonId: number
		description: string
		totalCost: string | null
		listId: number
		listName: string
		gifterId: string
		archivedAt: Date
		subjectDependentId: string | null
	}

	let dependentGiftRows: Array<DependentGiftRow> = []
	let dependentAddonRows: Array<DependentAddonRow> = []
	const dependentMeta = new Map<string, { id: string; name: string; image: string | null }>()
	if (myDependentIds.length > 0) {
		dependentGiftRows = await dbx
			.select({
				itemId: items.id,
				itemTitle: items.title,
				itemImageUrl: items.imageUrl,
				itemPrice: items.price,
				listId: lists.id,
				listName: lists.name,
				gifterId: giftedItems.gifterId,
				additionalGifterIds: giftedItems.additionalGifterIds,
				quantity: giftedItems.quantity,
				archivedAt: items.updatedAt,
				subjectDependentId: lists.subjectDependentId,
			})
			.from(giftedItems)
			.innerJoin(items, and(eq(items.id, giftedItems.itemId), eq(items.isArchived, true)))
			.innerJoin(lists, and(eq(lists.id, items.listId), inArray(lists.subjectDependentId, myDependentIds)))
			.orderBy(desc(items.updatedAt))

		dependentAddonRows = await dbx
			.select({
				addonId: listAddons.id,
				description: listAddons.description,
				totalCost: listAddons.totalCost,
				listId: lists.id,
				listName: lists.name,
				gifterId: listAddons.userId,
				archivedAt: listAddons.createdAt,
				subjectDependentId: lists.subjectDependentId,
			})
			.from(listAddons)
			.innerJoin(lists, and(eq(lists.id, listAddons.listId), inArray(lists.subjectDependentId, myDependentIds)))
			.where(eq(listAddons.isArchived, true))
			.orderBy(desc(listAddons.createdAt))

		const dependentRows = await dbx
			.select({ id: dependents.id, name: dependents.name, image: dependents.image })
			.from(dependents)
			.where(inArray(dependents.id, myDependentIds))
		for (const d of dependentRows) dependentMeta.set(d.id, { id: d.id, name: d.name, image: d.image })
	}

	// Resolve the initial pool of gifter userIds referenced by claims + addons.
	const seedIds = new Set<string>()
	for (const row of giftRows) {
		seedIds.add(row.gifterId)
		for (const id of row.additionalGifterIds ?? []) seedIds.add(id)
	}
	for (const row of addonRows) seedIds.add(row.gifterId)
	for (const row of dependentGiftRows) {
		seedIds.add(row.gifterId)
		for (const id of row.additionalGifterIds ?? []) seedIds.add(id)
	}
	for (const row of dependentAddonRows) seedIds.add(row.gifterId)

	const userLookup = new Map<string, PartneredUser>()
	if (seedIds.size > 0) {
		const rows = await dbx
			.select({ id: users.id, name: users.name, email: users.email, partnerId: users.partnerId })
			.from(users)
			.where(inArray(users.id, Array.from(seedIds)))
		for (const r of rows) userLookup.set(r.id, r)
	}

	// Fetch any partners referenced by the seed pool that aren't already loaded.
	const partnerIds = new Set<string>()
	for (const u of userLookup.values()) {
		if (u.partnerId && !userLookup.has(u.partnerId)) partnerIds.add(u.partnerId)
	}
	if (partnerIds.size > 0) {
		const rows = await dbx
			.select({ id: users.id, name: users.name, email: users.email, partnerId: users.partnerId })
			.from(users)
			.where(inArray(users.id, Array.from(partnerIds)))
		for (const r of rows) userLookup.set(r.id, r)
	}

	function collectNames(primaryId: string, additionalIds: Array<string> | null): Array<string> {
		const out: Array<string> = []
		for (const name of namesForGifter(primaryId, userLookup)) out.push(name)
		for (const id of additionalIds ?? []) {
			for (const name of namesForGifter(id, userLookup)) out.push(name)
		}
		return out
	}

	const gifts: Array<ReceivedGiftRow> = giftRows.map(r => ({
		type: 'item',
		itemId: r.itemId,
		itemTitle: r.itemTitle,
		itemImageUrl: r.itemImageUrl,
		itemPrice: r.itemPrice,
		listId: r.listId,
		listName: r.listName,
		gifterNames: collectNames(r.gifterId, r.additionalGifterIds),
		quantity: r.quantity,
		archivedAt: r.archivedAt,
	}))

	const addons: Array<ReceivedAddonRow> = addonRows.map(r => ({
		type: 'addon',
		addonId: r.addonId,
		description: r.description,
		totalCost: r.totalCost,
		listId: r.listId,
		listName: r.listName,
		gifterNames: collectNames(r.gifterId, null),
		archivedAt: r.archivedAt,
	}))

	const dependentSections = new Map<string, DependentReceivedSection>()
	for (const meta of dependentMeta.values()) {
		dependentSections.set(meta.id, { dependent: meta, gifts: [], addons: [] })
	}
	for (const r of dependentGiftRows) {
		if (!r.subjectDependentId) continue
		const section = dependentSections.get(r.subjectDependentId)
		if (!section) continue
		section.gifts.push({
			type: 'item',
			itemId: r.itemId,
			itemTitle: r.itemTitle,
			itemImageUrl: r.itemImageUrl,
			itemPrice: r.itemPrice,
			listId: r.listId,
			listName: r.listName,
			gifterNames: collectNames(r.gifterId, r.additionalGifterIds),
			quantity: r.quantity,
			archivedAt: r.archivedAt,
		})
	}
	for (const r of dependentAddonRows) {
		if (!r.subjectDependentId) continue
		const section = dependentSections.get(r.subjectDependentId)
		if (!section) continue
		section.addons.push({
			type: 'addon',
			addonId: r.addonId,
			description: r.description,
			totalCost: r.totalCost,
			listId: r.listId,
			listName: r.listName,
			gifterNames: collectNames(r.gifterId, null),
			archivedAt: r.archivedAt,
		})
	}

	// Drop sections with no gifts and no addons - the UI shouldn't show
	// an empty "Mochi" header.
	const dependentsResult = Array.from(dependentSections.values()).filter(s => s.gifts.length > 0 || s.addons.length > 0)

	return { gifts, addons, dependents: dependentsResult }
}

export const getReceivedGifts = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(({ context }): Promise<ReceivedGiftsResult> => getReceivedGiftsImpl({ userId: context.session.user.id }))
