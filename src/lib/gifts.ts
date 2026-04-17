/**
 * Pure helpers for the gifted-items claim flow.
 *
 * The SUM(quantity) ≤ item.quantity invariant is enforced at the application
 * layer inside a SELECT-FOR-UPDATE transaction (see src/api/gifts.ts). The
 * computation itself is split out here so it's trivially unit-testable without
 * standing up a DB.
 */

export type ClaimForRemainingCalc = {
	quantity: number
}

/**
 * Remaining claimable quantity for an item, given its current claims.
 *
 * Clamped to ≥0 so a somehow-over-claimed item (data drift, manual edit)
 * reports 0 rather than negative. Callers should treat a return value of 0
 * as "fully claimed".
 */
export function computeRemainingClaimableQuantity(itemQuantity: number, claims: ReadonlyArray<ClaimForRemainingCalc>): number {
	const claimed = claims.reduce((sum, c) => sum + c.quantity, 0)
	return Math.max(0, itemQuantity - claimed)
}

/**
 * Remaining claimable quantity as seen by a user who is EDITING one of their
 * own claims — the claim they're editing is excluded from the "already taken"
 * pool, since editing it replaces (rather than adds to) its quantity.
 *
 * Used to populate the max-quantity UX in the edit dialog. The server-side
 * guard performs the equivalent exclusion under a row lock, so this is purely
 * a presentation helper.
 */
export function computeRemainingClaimableQuantityExcluding(
	itemQuantity: number,
	claims: ReadonlyArray<ClaimForRemainingCalc & { id: number }>,
	excludeGiftId: number
): number {
	return computeRemainingClaimableQuantity(
		itemQuantity,
		claims.filter(c => c.id !== excludeGiftId)
	)
}

export type ItemForListCounts = {
	isArchived: boolean
	quantity: number
	gifts: ReadonlyArray<ClaimForRemainingCalc>
}

/**
 * Badge counts for a list as seen by someone other than the owner: total
 * visible items and how many of those still have claim capacity left.
 *
 * Archived items are excluded from both counts — they're hidden from the list
 * view, so including them would make the badge disagree with what the viewer
 * can see when they open the list.
 */
export function computeListItemCounts(items: ReadonlyArray<ItemForListCounts>): { total: number; unclaimed: number } {
	let total = 0
	let unclaimed = 0
	for (const item of items) {
		if (item.isArchived) continue
		total++
		if (computeRemainingClaimableQuantity(item.quantity, item.gifts) > 0) unclaimed++
	}
	return { total, unclaimed }
}
