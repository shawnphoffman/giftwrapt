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

function round2(n: number): number {
	return Math.round(n * 100) / 100
}

// One gifter unit's contribution to a claim, honoring a CUSTOM split when one is
// stored and falling back to the even split otherwise. `customRows` are the
// claim's stored co-gifter overrides ([] means even). `viewerGifterIds` is the
// [viewer, partner] pair used to find the viewer unit's own co-gifter amount.
// The primary unit's share is the residual (total - sum of co-gifter amounts),
// clamped at 0 so an over-pledged split never goes negative.
export function unitContribution(args: {
	totalCost: string | null | undefined
	additionalGifterIds: ReadonlyArray<string> | null | undefined
	isPrimaryUnit: boolean
	viewerGifterIds: ReadonlyArray<string>
	customRows: ReadonlyArray<{ userId: string; amount: string }>
}): number | null {
	const total = parseTotalCost(args.totalCost)
	if (total === null) return null
	if (args.customRows.length === 0) {
		return evenUnitShare(args.totalCost, unitCount(args.additionalGifterIds), args.isPrimaryUnit)
	}
	if (args.isPrimaryUnit) {
		const sumCustom = args.customRows.reduce((s, r) => s + (parseTotalCost(r.amount) ?? 0), 0)
		return Math.max(0, round2(total - sumCustom))
	}
	const mine = args.customRows.find(r => args.viewerGifterIds.includes(r.userId))
	return mine ? (parseTotalCost(mine.amount) ?? 0) : 0
}
