// The reveal email: "here's who gave you what", sent when a list's gifts
// are revealed and listing exactly what that reveal uncovered (items and
// off-list gifts). Every reveal trigger hands its `RevealedList` rows to
// `sendRevealEmails`: the auto-archive cron (all four passes, as one batch
// per run) and the edit-view force-reveal.
//
// One email per owner per call, with a section per list, so someone whose
// birthday list and wishlist reveal on the same day gets a single email.
// Each list's section is gated by its own per-type toggle; the reveal itself
// is never gated. See docs/logic.md "Reveal is the only email trigger".

import { and, asc, eq, inArray } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { giftedItems, items, listAddons, users } from '@/db/schema'
import type { RevealSummarySection } from '@/emails/reveal-summary-email'
import { formatGifterNames, namesForGifter, type PartneredUser } from '@/lib/gifters'
import { fanOutToGuardians } from '@/lib/guardian-emails'
import { createLogger } from '@/lib/logger'
import { isEmailConfigured, sendRevealSummaryEmail } from '@/lib/resend'
import type { RevealedList, RevealFamily } from '@/lib/reveal'

const log = createLogger('reveal-emails')

export type RevealEmailSettings = {
	enableBirthdayEmails: boolean
	enableChristmasEmails: boolean
	enableGenericHolidayEmails: boolean
}

const PLACEHOLDER_IMAGE = 'https://placehold.co/80x80?text=Gift'

function familyEnabled(family: RevealFamily, settings: RevealEmailSettings): boolean {
	if (family === 'birthday') return settings.enableBirthdayEmails
	if (family === 'christmas') return settings.enableChristmasEmails
	return settings.enableGenericHolidayEmails
}

// Subject + opening line for one owner's email. When every list in the email
// is for the same occasion the copy names it; a mixed batch stays generic.
function copyFor(revealed: ReadonlyArray<RevealedList>): { subject: string; intro?: string } {
	const occasions = new Set(revealed.map(r => r.occasion))
	if (occasions.size !== 1) return { subject: 'A look back at your gifts' }
	const [only] = revealed
	if (only.family === 'birthday') return { subject: 'A look back at your gifts', intro: 'We hope you had a wonderful birthday.' }
	return { subject: `A look back at your ${only.occasion} gifts`, intro: `We hope your ${only.occasion} was wonderful.` }
}

/**
 * Resolve one owner's revealed lists into email sections: every revealed
 * item with its gifters (partners and co-gifters credited via the
 * gifter-name lookup), then every revealed off-list gift.
 *
 * The recipient is kept out of their own gift's attribution (a gift from the
 * recipient's partner reads "Kate", never "Kate & Jeff" in Jeff's own
 * summary). On a dependent-subject list the owner is a gifter, not the
 * recipient, so nobody is excluded.
 */
export async function buildRevealSections(
	db: SchemaDatabase,
	ownerId: string,
	revealed: ReadonlyArray<RevealedList>
): Promise<Array<RevealSummarySection>> {
	const itemIds = revealed.flatMap(r => r.itemIds)
	const addonIds = revealed.flatMap(r => r.addonIds)

	const giftRows =
		itemIds.length > 0
			? await db
					.select({
						itemId: items.id,
						listId: items.listId,
						title: items.title,
						imageUrl: items.imageUrl,
						gifterId: giftedItems.gifterId,
						additionalGifterIds: giftedItems.additionalGifterIds,
					})
					.from(giftedItems)
					.innerJoin(items, and(eq(items.id, giftedItems.itemId), inArray(items.id, itemIds)))
					.orderBy(asc(items.id), asc(giftedItems.id))
			: []
	const addonRows =
		addonIds.length > 0
			? await db
					.select({
						listId: listAddons.listId,
						description: listAddons.description,
						imageUrl: listAddons.imageUrl,
						gifterId: listAddons.userId,
					})
					.from(listAddons)
					.where(inArray(listAddons.id, addonIds))
					.orderBy(asc(listAddons.id))
			: []

	const gifterIds = new Set<string>([ownerId])
	for (const gift of giftRows) {
		gifterIds.add(gift.gifterId)
		for (const id of gift.additionalGifterIds ?? []) gifterIds.add(id)
	}
	for (const addon of addonRows) gifterIds.add(addon.gifterId)

	const userColumns = { id: users.id, name: users.name, email: users.email, partnerId: users.partnerId }
	const lookup = new Map<string, PartneredUser>()
	const gifterRows = await db
		.select(userColumns)
		.from(users)
		.where(inArray(users.id, Array.from(gifterIds)))
	for (const r of gifterRows) lookup.set(r.id, r)
	const partnerIds = new Set<string>()
	for (const u of lookup.values()) {
		if (u.partnerId && !lookup.has(u.partnerId)) partnerIds.add(u.partnerId)
	}
	if (partnerIds.size > 0) {
		const partnerRows = await db
			.select(userColumns)
			.from(users)
			.where(inArray(users.id, Array.from(partnerIds)))
		for (const r of partnerRows) lookup.set(r.id, r)
	}

	const sections: Array<RevealSummarySection> = []
	for (const list of revealed) {
		const recipientId = list.subjectDependentId ? null : ownerId
		const byItem = new Map<number, { title: string; image_url: string; names: Array<string> }>()
		for (const gift of giftRows) {
			if (gift.listId !== list.listId) continue
			let bucket = byItem.get(gift.itemId)
			if (!bucket) {
				bucket = { title: gift.title, image_url: gift.imageUrl || PLACEHOLDER_IMAGE, names: [] }
				byItem.set(gift.itemId, bucket)
			}
			for (const id of [gift.gifterId, ...(gift.additionalGifterIds ?? [])]) {
				for (const name of namesForGifter(id, lookup, recipientId)) bucket.names.push(name)
			}
		}
		const sectionItems: RevealSummarySection['items'] = Array.from(byItem.values()).map(i => ({
			title: i.title,
			image_url: i.image_url,
			gifters: formatGifterNames(i.names),
		}))
		for (const addon of addonRows) {
			if (addon.listId !== list.listId) continue
			sectionItems.push({
				title: addon.description,
				image_url: addon.imageUrl || PLACEHOLDER_IMAGE,
				gifters: formatGifterNames(namesForGifter(addon.gifterId, lookup, recipientId)),
				offList: true,
			})
		}
		if (sectionItems.length > 0) sections.push({ listName: list.listName, items: sectionItems })
	}
	return sections
}

/**
 * Send the reveal email for a batch of just-revealed lists: one email per
 * owner, covering every list of theirs in the batch whose per-type toggle is
 * on. Guardians of a child owner get a copy. Returns the number of owners
 * emailed. A failure for one owner is logged and does not stop the rest.
 */
export async function sendRevealEmails(
	db: SchemaDatabase,
	revealed: ReadonlyArray<RevealedList>,
	settings: RevealEmailSettings
): Promise<number> {
	const eligible = revealed.filter(r => familyEnabled(r.family, settings) && (r.itemIds.length > 0 || r.addonIds.length > 0))
	if (eligible.length === 0) return 0
	if (!(await isEmailConfigured(db))) return 0

	const byOwner = new Map<string, Array<RevealedList>>()
	for (const r of eligible) {
		const bucket = byOwner.get(r.ownerId)
		if (bucket) bucket.push(r)
		else byOwner.set(r.ownerId, [r])
	}

	let sent = 0
	for (const [ownerId, ownerLists] of byOwner) {
		try {
			const owner = await db.query.users.findFirst({ where: eq(users.id, ownerId), columns: { id: true, email: true, banned: true } })
			if (!owner || owner.banned) continue
			const sections = await buildRevealSections(db, ownerId, ownerLists)
			if (sections.length === 0) continue
			const email = { ...copyFor(ownerLists), sections }
			await sendRevealSummaryEmail(owner.email, email)
			sent += 1
			await fanOutToGuardians(db, owner.id, g => sendRevealSummaryEmail(g.email, email))
		} catch (err) {
			log.warn({ err: err instanceof Error ? err.message : String(err), ownerId }, 'reveal email failed')
		}
	}
	return sent
}
