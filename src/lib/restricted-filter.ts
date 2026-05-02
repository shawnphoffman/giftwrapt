/**
 * Item filtering for restricted viewers.
 *
 * Pure helpers (no DB) so they can be unit-tested. Callers pass the items
 * with their full claim sets; the filter returns the subset visible to a
 * restricted viewer plus the per-item claim redaction.
 *
 * Rules (from the restricted-share design):
 * - An item is visible if it has no claims OR at least one claim is by the
 *   viewer or the viewer's partner (counting `additionalGifterIds`).
 * - Within a visible item, claim records by gifters outside the (viewer,
 *   partner) set are stripped from the response.
 * - Remaining claimable quantity is computed from ALL underlying claims.
 *   Callers should still surface the truthful number; the filter does not
 *   touch it.
 * - For an `or` item group, if any item in the group has a claim by an
 *   outsider, every sibling in the group is hidden.
 * - For an `order` item group, hide items past the first unfulfilled
 *   position. Partner+viewer claims count as "fulfilled" the same as anyone
 *   else's.
 */

import type { GroupType } from '@/db/schema/enums'

export type ClaimRecord = {
	gifterId: string
	additionalGifterIds: ReadonlyArray<string> | null
	quantity: number
}

export type ItemForRestrictedFilter<TGift extends ClaimRecord = ClaimRecord> = {
	id: number
	quantity: number
	groupId: number | null
	groupSortOrder: number | null
	gifts: ReadonlyArray<TGift>
}

export type GroupForRestrictedFilter = {
	id: number
	type: GroupType
}

export function isInsiderClaim(claim: ClaimRecord, gifterIds: ReadonlySet<string>): boolean {
	if (gifterIds.has(claim.gifterId)) return true
	for (const id of claim.additionalGifterIds ?? []) {
		if (gifterIds.has(id)) return true
	}
	return false
}

function sumQuantity(claims: ReadonlyArray<ClaimRecord>): number {
	let total = 0
	for (const c of claims) total += c.quantity
	return total
}

/**
 * Apply the restricted-viewer filter to a list of items.
 *
 * Returns a new array of items in the same order. Each surviving item has
 * its `gifts` array narrowed to insider claims only.
 */
export function filterItemsForRestricted<TGift extends ClaimRecord, TItem extends ItemForRestrictedFilter<TGift>>(
	items: ReadonlyArray<TItem>,
	groups: ReadonlyArray<GroupForRestrictedFilter>,
	viewerId: string,
	partnerId: string | null
): Array<TItem & { gifts: Array<TGift> }> {
	const gifterIds = new Set<string>([viewerId])
	if (partnerId) gifterIds.add(partnerId)

	const groupTypeById = new Map(groups.map(g => [g.id, g.type]))

	// For 'or' groups, hide every sibling once any item in the group has an
	// outsider claim. (Insider-only claims still effectively lock the group
	// for everyone via the existing canViewList/claim path; for restricted
	// viewers we don't pre-hide insider-locked groups - they can see the
	// item they or their partner already claimed.)
	const orGroupHasOutsiderClaim = new Set<number>()
	for (const item of items) {
		if (item.groupId === null) continue
		const groupType = groupTypeById.get(item.groupId)
		if (groupType !== 'or') continue
		for (const claim of item.gifts) {
			if (!isInsiderClaim(claim, gifterIds)) {
				orGroupHasOutsiderClaim.add(item.groupId)
				break
			}
		}
	}

	// For 'order' groups, find the first unfulfilled position per group.
	// "Fulfilled" = SUM(claims.quantity) >= item.quantity. Items past that
	// position are hidden, regardless of who claimed (matches the existing
	// claim-time gate).
	const firstUnfulfilledOrderByGroup = new Map<number, number>()
	const orderGroupItems = new Map<number, Array<TItem>>()
	for (const item of items) {
		if (item.groupId === null) continue
		if (groupTypeById.get(item.groupId) !== 'order') continue
		if (item.groupSortOrder === null) continue
		const bucket = orderGroupItems.get(item.groupId) ?? []
		bucket.push(item)
		orderGroupItems.set(item.groupId, bucket)
	}
	for (const [groupId, groupItems] of orderGroupItems) {
		const sorted = [...groupItems].sort((a, b) => (a.groupSortOrder ?? 0) - (b.groupSortOrder ?? 0))
		for (const item of sorted) {
			const claimed = sumQuantity(item.gifts)
			if (claimed < item.quantity) {
				firstUnfulfilledOrderByGroup.set(groupId, item.groupSortOrder ?? 0)
				break
			}
		}
	}

	const out: Array<TItem & { gifts: Array<TGift> }> = []
	for (const item of items) {
		// Group-locked 'or' siblings drop entirely.
		if (item.groupId !== null && orGroupHasOutsiderClaim.has(item.groupId)) continue

		// 'order' group: hide items past the first unfulfilled position.
		if (item.groupId !== null && groupTypeById.get(item.groupId) === 'order' && item.groupSortOrder !== null) {
			const firstUnfulfilled = firstUnfulfilledOrderByGroup.get(item.groupId)
			if (firstUnfulfilled !== undefined && item.groupSortOrder > firstUnfulfilled) continue
		}

		// Hide items where at least one claim exists AND no claim is by an
		// insider. Insider-claim items are visible (with outsider claims
		// redacted).
		const insiderClaims: Array<TGift> = []
		let anyOutsider = false
		for (const claim of item.gifts) {
			if (isInsiderClaim(claim, gifterIds)) insiderClaims.push(claim)
			else anyOutsider = true
		}
		if (item.gifts.length > 0 && insiderClaims.length === 0) continue

		// Strip outsider co-gifters from each surviving claim's
		// `additionalGifterIds`, so the restricted viewer never learns about
		// outsiders even via the co-gifter array.
		const sanitizedClaims = insiderClaims.map(claim => {
			const additional = claim.additionalGifterIds
			if (!additional || additional.length === 0) return claim
			const filtered = additional.filter(id => gifterIds.has(id))
			if (filtered.length === additional.length) return claim
			return { ...claim, additionalGifterIds: filtered.length > 0 ? filtered : null }
		})

		out.push({ ...item, gifts: sanitizedClaims })
		// Reference anyOutsider so callers that want a "redacted?" flag in the
		// future have an obvious place to thread it; today we don't surface it.
		void anyOutsider
	}

	return out
}
