// The reveal email: "here's who gave you what", sent when a list's gifts
// are revealed and listing exactly what that reveal uncovered (items and
// off-list gifts). Every reveal trigger hands its `RevealedList` rows to
// `sendRevealEmails`: the auto-archive cron (all four passes, as one batch
// per run) and the edit-view force-reveal.
//
// One email per recipient per call, with a section per list, so someone
// whose birthday list and wishlist reveal on the same day gets a single
// email. The recipient is the list owner, or every guardian of the
// dependent a list is for. Each list's section is gated by its own
// per-type toggle; the reveal itself is never gated. See docs/logic.md
// "Reveal is the only email trigger".

import { and, asc, eq, inArray } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { dependentGuardianships, dependents, giftedItems, items, listAddons, users } from '@/db/schema'
import type { RevealSummarySection } from '@/emails/reveal-summary-email'
import { resolveEmailImages } from '@/lib/email-images'
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

function familyEnabled(family: RevealFamily, settings: RevealEmailSettings): boolean {
	if (family === 'birthday') return settings.enableBirthdayEmails
	if (family === 'christmas') return settings.enableChristmasEmails
	return settings.enableGenericHolidayEmails
}

// Subject + opening line for one recipient's email. When every list in the
// email is for the same occasion and the same person the copy names them; a
// mixed batch stays generic.
function copyFor(revealed: ReadonlyArray<RevealedList>, dependentNames: ReadonlyMap<string, string>): { subject: string; intro: string } {
	const keys = new Set(revealed.map(r => `${r.family}|${r.occasion}|${r.subjectDependentId ?? ''}`))
	if (keys.size !== 1) return { subject: 'A look back at your gifts', intro: "Here's who gave what." }
	const [only] = revealed
	const dep = only.subjectDependentId ? (dependentNames.get(only.subjectDependentId) ?? null) : null
	if (only.family === 'birthday') {
		return dep
			? { subject: `A look back at ${dep}'s gifts`, intro: `We hope ${dep} had a wonderful birthday. Here's who gave ${dep} what.` }
			: { subject: 'A look back at your gifts', intro: "We hope you had a wonderful birthday. Here's who gave you what." }
	}
	return dep
		? {
				subject: `A look back at ${dep}'s ${only.occasion} gifts`,
				intro: `We hope ${dep}'s ${only.occasion} was wonderful. Here's who gave ${dep} what.`,
			}
		: {
				subject: `A look back at your ${only.occasion} gifts`,
				intro: `We hope your ${only.occasion} was wonderful. Here's who gave you what.`,
			}
}

/**
 * Resolve revealed lists into email sections: every revealed item with its
 * gifters (partners and co-gifters credited via the gifter-name lookup),
 * then every revealed off-list gift. `image_url` is the stored URL as is;
 * `sendRevealEmails` makes it mail-safe afterwards.
 *
 * The recipient is kept out of their own gift's attribution (a gift from the
 * recipient's partner reads "Kate", never "Kate & Jeff" in Jeff's own
 * summary). On a dependent-subject list the owner is a gifter, not the
 * recipient, so nobody is excluded.
 */
export async function buildRevealSections(db: SchemaDatabase, revealed: ReadonlyArray<RevealedList>): Promise<Array<RevealSummarySection>> {
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

	const gifterIds = new Set<string>(revealed.map(r => r.ownerId))
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
		const recipientId = list.subjectDependentId ? null : list.ownerId
		const byItem = new Map<number, { title: string; image_url: string | null; names: Array<string> }>()
		for (const gift of giftRows) {
			if (gift.listId !== list.listId) continue
			let bucket = byItem.get(gift.itemId)
			if (!bucket) {
				bucket = { title: gift.title, image_url: gift.imageUrl, names: [] }
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
				image_url: addon.imageUrl,
				gifters: formatGifterNames(namesForGifter(addon.gifterId, lookup, recipientId)),
				offList: true,
			})
		}
		if (sectionItems.length > 0) sections.push({ listName: list.listName, items: sectionItems })
	}
	return sections
}

// Swap every image URL for the one a mail client can load, or null for the
// placeholder graphic.
async function withEmailSafeImages(sections: Array<RevealSummarySection>): Promise<Array<RevealSummarySection>> {
	const resolved = await resolveEmailImages(sections.flatMap(s => s.items.map(i => i.image_url)))
	return sections.map(s => ({
		...s,
		items: s.items.map(i => ({ ...i, image_url: i.image_url ? (resolved.get(i.image_url) ?? null) : null })),
	}))
}

/**
 * Send the reveal email for a batch of just-revealed lists: one email per
 * recipient (the list owner, or every guardian of the dependent the list is
 * for), covering every list of theirs in the batch whose per-type toggle is
 * on. Guardians of a child recipient get a copy. Returns the number of
 * recipients emailed. A failure for one recipient is logged and does not
 * stop the rest.
 */
export async function sendRevealEmails(
	db: SchemaDatabase,
	revealed: ReadonlyArray<RevealedList>,
	settings: RevealEmailSettings
): Promise<number> {
	const eligible = revealed.filter(r => familyEnabled(r.family, settings) && (r.itemIds.length > 0 || r.addonIds.length > 0))
	if (eligible.length === 0) return 0
	if (!(await isEmailConfigured(db))) return 0

	const dependentIds = Array.from(new Set(eligible.map(r => r.subjectDependentId).filter((id): id is string => !!id)))
	const dependentNames = new Map<string, string>()
	const guardiansByDependent = new Map<string, Array<string>>()
	if (dependentIds.length > 0) {
		const nameRows = await db
			.select({ id: dependents.id, name: dependents.name })
			.from(dependents)
			.where(inArray(dependents.id, dependentIds))
		for (const r of nameRows) dependentNames.set(r.id, r.name)
		const guardianRows = await db
			.select({ dependentId: dependentGuardianships.dependentId, userId: dependentGuardianships.guardianUserId })
			.from(dependentGuardianships)
			.where(inArray(dependentGuardianships.dependentId, dependentIds))
		for (const r of guardianRows) {
			const bucket = guardiansByDependent.get(r.dependentId)
			if (bucket) bucket.push(r.userId)
			else guardiansByDependent.set(r.dependentId, [r.userId])
		}
	}

	const byRecipient = new Map<string, Array<RevealedList>>()
	for (const r of eligible) {
		const recipientIds = r.subjectDependentId ? (guardiansByDependent.get(r.subjectDependentId) ?? []) : [r.ownerId]
		for (const id of recipientIds) {
			const bucket = byRecipient.get(id)
			if (bucket) bucket.push(r)
			else byRecipient.set(id, [r])
		}
	}

	let sent = 0
	for (const [recipientId, recipientLists] of byRecipient) {
		try {
			const recipient = await db.query.users.findFirst({
				where: eq(users.id, recipientId),
				columns: { id: true, email: true, banned: true },
			})
			if (!recipient || recipient.banned) continue
			const sections = await withEmailSafeImages(await buildRevealSections(db, recipientLists))
			if (sections.length === 0) continue
			const email = { ...copyFor(recipientLists, dependentNames), sections }
			await sendRevealSummaryEmail(recipient.email, email)
			sent += 1
			await fanOutToGuardians(db, recipient.id, g => sendRevealSummaryEmail(g.email, email))
		} catch (err) {
			log.warn({ err: err instanceof Error ? err.message : String(err), recipientId }, 'reveal email failed')
		}
	}
	return sent
}
