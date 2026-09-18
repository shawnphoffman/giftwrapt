// ===============================
// Gifter name formatting
// ===============================
// Shared between the received-gifts UI, the post-birthday email, and the
// purchase-summary grouping so partner + co-gifter attribution reads
// consistently: "Alice", "Alice & Bob", "Alice, Bob & Carol". Deduplicates
// while preserving order so a claim whose primary gifter also appears as a
// co-gifter won't repeat the name. The recipient of a gift is never named
// as a co-giver of it; see `namesForGifter` and `buildGifterUnits`.

export type PartneredUser = {
	id?: string
	name: string | null
	email: string
	partnerId: string | null
}

export function displayName(u: Pick<PartneredUser, 'name' | 'email'>): string {
	return u.name || u.email
}

export function formatGifterNames(names: ReadonlyArray<string>): string {
	const seen = new Set<string>()
	const unique: Array<string> = []
	for (const name of names) {
		const trimmed = name.trim()
		if (!trimmed || seen.has(trimmed)) continue
		seen.add(trimmed)
		unique.push(trimmed)
	}
	if (unique.length === 0) return ''
	if (unique.length === 1) return unique[0]
	if (unique.length === 2) return `${unique[0]} & ${unique[1]}`
	return `${unique.slice(0, -1).join(', ')} & ${unique[unique.length - 1]}`
}

// Expand a single gifter id into their display name plus their partner's
// display name (when the partner is resolvable). Unknown ids return [] so
// the caller can concat safely.
//
// `recipientId` is the person receiving the gift and must never be named as
// a co-giver of their own gift: when the gifter's partner IS the recipient,
// the gifter is named solo ("Kate", not "Kate & Jeff" on Jeff's own
// birthday). The check is symmetric, matching `buildGifterUnits`: either the
// gifter names the recipient as partner, or the recipient names the gifter.
// Callers must load the recipient into `lookup` for the second direction to
// resolve.
export function namesForGifter(id: string, lookup: ReadonlyMap<string, PartneredUser>, recipientId: string | null = null): Array<string> {
	const user = lookup.get(id)
	if (!user) return []
	const out = [displayName(user)]
	const recipient = recipientId ? lookup.get(recipientId) : undefined
	const partnerIsRecipient =
		recipientId !== null && (user.partnerId === recipientId || (recipient?.partnerId != null && recipient.partnerId === id))
	if (user.partnerId && !partnerIsRecipient) {
		const partner = lookup.get(user.partnerId)
		if (partner) out.push(displayName(partner))
	}
	return out
}
