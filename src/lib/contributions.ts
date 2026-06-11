// ===============================
// Contribution split
// ===============================
// A claim's `totalCost` is divided among its participant UNITS (primary +
// co-gifters; see gifter-units.ts). The default is an EVEN split. Splits are
// computed in integer cents so the per-unit shares always sum to the total
// exactly; any leftover cent(s) from a total that doesn't divide evenly land on
// the PRIMARY unit.
//
// Cost is only meaningful when `totalCost` parses to a valid non-negative
// number. Otherwise every share is null (the common "no price entered" case)
// and callers render units without dollar amounts.
//
// The stored co-gifter unit count drives the denominator directly: the picker
// stores one id per unit, so `1 + additionalGifterIds.length` IS the unit count
// (a partner-paired co-gifter is a single stored id). Custom overrides
// (Release 2) replace the even default per unit.

// Parse `giftedItems.totalCost` (a numeric string) into a non-negative number,
// or null when it isn't a usable amount.
export function parseTotalCost(totalCost: string | null | undefined): number | null {
	if (totalCost == null) return null
	const trimmed = totalCost.trim()
	if (trimmed === '') return null
	const n = Number(trimmed)
	if (!Number.isFinite(n) || n < 0) return null
	return n
}

// The number of participant units on a claim: the primary unit plus one unit
// per stored co-gifter id.
export function unitCount(additionalGifterIds: ReadonlyArray<string> | null | undefined): number {
	return 1 + (additionalGifterIds?.length ?? 0)
}

// One unit's even-split share of a claim, in dollars, or null when there is no
// valid cost. The primary unit absorbs the rounding remainder so the shares sum
// to the total exactly.
export function evenUnitShare(totalCost: string | null | undefined, units: number, isPrimaryUnit: boolean): number | null {
	const total = parseTotalCost(totalCost)
	if (total === null) return null
	if (units <= 0) return null
	const totalCents = Math.round(total * 100)
	const base = Math.floor(totalCents / units)
	const remainder = totalCents - base * units
	const cents = isPrimaryUnit ? base + remainder : base
	return cents / 100
}
