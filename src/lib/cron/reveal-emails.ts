// Per-type "your gifts were revealed" email senders, shared by the
// auto-archive cron's deferred-due pass and the manual force-reveal server
// fn. Each path reveals a single list's claimed items + addons and then
// notifies the owner with the email family that matches the list type,
// gated by the same global toggles the normal cron passes use.
//
// Birthday/wishlist reuse the post-birthday gifter-summary email (the same
// one the daily birthday-emails cron sends on birthday+N); christmas and
// generic holidays reuse the post-holiday template. See .notes/logic.md
// "Auto-archive deferral & last-archived".

import { and, eq, inArray } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { customHolidays, giftedItems, items, users } from '@/db/schema'
import { formatGifterNames, namesForGifter, type PartneredUser } from '@/lib/gifters'
import { fanOutToGuardians } from '@/lib/guardian-emails'
import { visibleItemsWhere } from '@/lib/item-visibility'
import { isEmailConfigured, sendPostBirthdayEmail, sendPostHolidayEmail } from '@/lib/resend'

export type RevealEmailSettings = {
	enableBirthdayEmails: boolean
	enableChristmasEmails: boolean
	enableGenericHolidayEmails: boolean
}

export type RevealEmailList = {
	id: number
	ownerId: string
	name: string
	type: string
	customHolidayId: string | null
}

type ArchivedGiftRow = {
	itemTitle: string
	itemImageUrl: string | null
	gifterId: string
	additionalGifterIds: Array<string> | null
}

export type PostBirthdayEmailItem = { title: string; image_url: string; gifters: string }

// Resolve revealed (archived, non-pending-deletion) claimed gifts into the
// {title, image_url, gifters} rows the post-birthday email template wants,
// crediting both partners and co-gifters via the gifter-name lookup. Shared
// with birthdayEmailsImpl so the per-user and per-list paths stay identical.
export async function buildPostBirthdayEmailItems(
	db: SchemaDatabase,
	gifts: ReadonlyArray<ArchivedGiftRow>
): Promise<Array<PostBirthdayEmailItem>> {
	if (gifts.length === 0) return []

	const gifterIds = new Set<string>()
	for (const gift of gifts) {
		gifterIds.add(gift.gifterId)
		for (const id of gift.additionalGifterIds ?? []) gifterIds.add(id)
	}

	const lookup = new Map<string, PartneredUser>()
	if (gifterIds.size > 0) {
		const rows = await db
			.select({ id: users.id, name: users.name, email: users.email, partnerId: users.partnerId })
			.from(users)
			.where(inArray(users.id, Array.from(gifterIds)))
		for (const r of rows) lookup.set(r.id, r)
	}
	const partnerIds = new Set<string>()
	for (const u of lookup.values()) {
		if (u.partnerId && !lookup.has(u.partnerId)) partnerIds.add(u.partnerId)
	}
	if (partnerIds.size > 0) {
		const rows = await db
			.select({ id: users.id, name: users.name, email: users.email, partnerId: users.partnerId })
			.from(users)
			.where(inArray(users.id, Array.from(partnerIds)))
		for (const r of rows) lookup.set(r.id, r)
	}

	const itemMap = new Map<string, { title: string; image_url: string; names: Array<string> }>()
	for (const gift of gifts) {
		const key = gift.itemTitle
		if (!itemMap.has(key)) {
			itemMap.set(key, { title: gift.itemTitle, image_url: gift.itemImageUrl || 'https://placehold.co/80x80?text=Gift', names: [] })
		}
		const bucket = itemMap.get(key)!
		for (const name of namesForGifter(gift.gifterId, lookup)) bucket.names.push(name)
		for (const id of gift.additionalGifterIds ?? []) {
			for (const name of namesForGifter(id, lookup)) bucket.names.push(name)
		}
	}

	return Array.from(itemMap.values()).map(i => ({ title: i.title, image_url: i.image_url, gifters: formatGifterNames(i.names) }))
}

async function revealedGiftsForList(db: SchemaDatabase, listId: number): Promise<Array<ArchivedGiftRow>> {
	return db
		.select({
			itemTitle: items.title,
			itemImageUrl: items.imageUrl,
			gifterId: giftedItems.gifterId,
			additionalGifterIds: giftedItems.additionalGifterIds,
		})
		.from(giftedItems)
		.innerJoin(items, and(eq(items.id, giftedItems.itemId), visibleItemsWhere('revealed'), eq(items.listId, listId)))
}

/**
 * Send the reveal email matching the list's type, respecting the per-type
 * global toggle and email configuration. Returns true if an owner email was
 * sent. Safe to call after the list's items + addons have been archived.
 */
export async function maybeSendListRevealEmail(db: SchemaDatabase, list: RevealEmailList, settings: RevealEmailSettings): Promise<boolean> {
	if (!(await isEmailConfigured(db))) return false

	const owner = await db.query.users.findFirst({ where: eq(users.id, list.ownerId), columns: { id: true, email: true } })
	if (!owner) return false

	if (list.type === 'birthday' || list.type === 'wishlist') {
		if (!settings.enableBirthdayEmails) return false
		const gifts = await revealedGiftsForList(db, list.id)
		const emailItems = await buildPostBirthdayEmailItems(db, gifts)
		if (emailItems.length === 0) return false
		await sendPostBirthdayEmail(owner.email, emailItems)
		await fanOutToGuardians(db, owner.id, g => sendPostBirthdayEmail(g.email, emailItems))
		return true
	}

	if (list.type === 'christmas') {
		if (!settings.enableChristmasEmails) return false
		await sendPostHolidayEmail(owner.email, { holidayName: 'Christmas', listName: list.name })
		return true
	}

	if (list.type === 'holiday') {
		if (!settings.enableGenericHolidayEmails) return false
		let holidayName = 'your holiday'
		if (list.customHolidayId) {
			const h = await db.query.customHolidays.findFirst({ where: eq(customHolidays.id, list.customHolidayId), columns: { title: true } })
			if (h) holidayName = h.title
		}
		await sendPostHolidayEmail(owner.email, { holidayName, listName: list.name })
		return true
	}

	return false
}
