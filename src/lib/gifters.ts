// ===============================
// Gifter name formatting
// ===============================
// Shared between the received-gifts UI, the post-birthday email, and the
// purchase-summary grouping so partner + co-gifter attribution reads
// consistently: "Alice", "Alice & Bob", "Alice, Bob & Carol". Deduplicates
// while preserving order so a claim whose primary gifter also appears as a
// co-gifter won't repeat the name.

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
export function namesForGifter(id: string, lookup: ReadonlyMap<string, PartneredUser>): Array<string> {
	const user = lookup.get(id)
	if (!user) return []
	const out = [displayName(user)]
	if (user.partnerId) {
		const partner = lookup.get(user.partnerId)
		if (partner) out.push(displayName(partner))
	}
	return out
}
