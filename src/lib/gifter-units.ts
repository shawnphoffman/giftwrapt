// ===============================
// Gifter units (households)
// ===============================
// A "gifter unit" is a gifter plus their partner, treated as one atom for
// display and cost-splitting (a solo gifter is a unit of one). Both members
// render together ("Alice & Bob"). A unit NEVER includes the gift's recipient -
// buying for your partner shows you solo, not as a pair.
//
// This is the shared resolver behind the received-gifts page, the item gifting
// view, and the purchases split. It is pure (no DB) so it can be unit-tested;
// callers pass a lookup map of every referenced user plus their partner.

import { displayName, formatGifterNames, type PartneredUser } from '@/lib/gifters'

export type GifterUserMeta = PartneredUser & { image: string | null }

// A gifter household: solo gifter, or a primary + partner pair. The pair label
// uses `formatGifterNames`, e.g. "Alice & Bob".
export type GifterUnit = {
	key: string
	label: string
	members: Array<{ id: string; name: string; image: string | null }>
}

// Resolve the gifter ids on a single claim/addon into deduped household units.
//
// `recipientId` is the person who must never appear as a unit member - their
// own gift shouldn't list them as a co-giver. On the received page this is the
// viewer (they ARE the recipient); on the gifting view it's the list owner; for
// dependent-subject lists it's null (the recipient is a dependent, not a user,
// so no gifter's partner can match). Two co-gifters from the same household
// collapse into one unit.
export function buildGifterUnits(
	primaryId: string,
	additionalIds: Array<string> | null,
	recipientId: string | null,
	lookup: ReadonlyMap<string, GifterUserMeta>
): Array<GifterUnit> {
	const ids = new Set<string>([primaryId, ...(additionalIds ?? [])])
	const units = new Map<string, GifterUnit>()

	for (const id of ids) {
		const user = lookup.get(id)
		if (!user) continue

		// Symmetric partner check: the recipient is whoever has the gifter as
		// their partnerId, or whoever the gifter names as their partnerId. When
		// the gifter's partner IS the recipient, force the gifter solo - the
		// recipient must never show as a co-giver of their own gift.
		const recipientUser = recipientId ? lookup.get(recipientId) : undefined
		const partnerIsRecipient =
			recipientId !== null &&
			(user.partnerId === recipientId || (recipientUser?.partnerId !== null && recipientUser?.partnerId === user.id))

		const partner = !partnerIsRecipient && user.partnerId ? lookup.get(user.partnerId) : undefined

		if (partner) {
			const sorted = [user, partner].sort((a, b) => (a.id! < b.id! ? -1 : 1))
			const key = `pair:${sorted[0].id}:${sorted[1].id}`
			if (!units.has(key)) {
				units.set(key, {
					key,
					label: formatGifterNames(sorted.map(displayName)),
					members: sorted.map(u => ({ id: u.id!, name: displayName(u), image: u.image })),
				})
			}
		} else {
			const key = `solo:${user.id}`
			if (!units.has(key)) {
				units.set(key, {
					key,
					label: displayName(user),
					members: [{ id: user.id!, name: displayName(user), image: user.image }],
				})
			}
		}
	}

	return Array.from(units.values())
}
