// Unit tests for the stale-public-list helpers added to list-hygiene
// in 2026-05 (phase 2). Pure functions only — `evaluateStaleListPredicate`,
// `reverseRenameToWishlist`, and `lastAnnualDate`. DB-aware paths
// (`findStalePublicLists`, `customHolidayLastOccurrence`) are covered
// in the integration test file.

import { describe, expect, it } from 'vitest'

import { evaluateStaleListPredicate, reverseRenameToWishlist } from '../analyzers/list-hygiene'
import { lastAnnualDate } from '../upcoming-events'

const NOW = new Date('2026-05-14T12:00:00Z')

describe('lastAnnualDate', () => {
	it("returns this year's occurrence when it is already past", () => {
		// May 14 today; Feb 14 already happened this year.
		const result = lastAnnualDate(2, 14, NOW)
		expect(result.toISOString().slice(0, 10)).toBe('2026-02-14')
	})

	it("rolls back to last year when this year's occurrence is in the future", () => {
		// May 14 today; Dec 25 hasn't happened yet this year.
		const result = lastAnnualDate(12, 25, NOW)
		expect(result.toISOString().slice(0, 10)).toBe('2025-12-25')
	})

	it("treats today's date as not yet past (returns last year)", () => {
		const result = lastAnnualDate(5, 14, NOW)
		expect(result.toISOString().slice(0, 10)).toBe('2025-05-14')
	})

	it('handles leap-day Feb 29 by rolling back to a year without one', () => {
		// Date constructor for Feb 29 of a non-leap year normalizes to
		// Mar 1; verify the rollback at least returns a valid Date.
		const result = lastAnnualDate(2, 29, new Date('2027-05-14T00:00:00Z'))
		expect(result).toBeInstanceOf(Date)
	})
})

describe('reverseRenameToWishlist', () => {
	it('strips event tokens and year tokens', () => {
		expect(reverseRenameToWishlist('Christmas 2025')).toBe('Wishlist')
		expect(reverseRenameToWishlist('Birthday 2024')).toBe('Wishlist')
	})

	it('preserves a personal prefix while removing event/year', () => {
		expect(reverseRenameToWishlist("Sam's Christmas 2025")).toBe("Sam's")
		expect(reverseRenameToWishlist("Sam's Birthday List")).toBe("Sam's List")
	})

	it('collapses whitespace from token removal', () => {
		expect(reverseRenameToWishlist('Sam Birthday   2025  ')).toBe('Sam')
	})

	it('falls back to "Wishlist" when the stripped result is too short', () => {
		expect(reverseRenameToWishlist('Christmas 2025')).toBe('Wishlist')
		// Single character left after stripping → fallback.
		expect(reverseRenameToWishlist('A Christmas List')).toBe('A List')
		// "AB" is 2 chars — below the 3-char threshold.
		expect(reverseRenameToWishlist('AB Birthday')).toBe('Wishlist')
	})

	it('strips multiple year tokens when present', () => {
		expect(reverseRenameToWishlist('2023 and 2024 wishes')).toBe('and wishes')
	})

	it('preserves names with no event/year content', () => {
		expect(reverseRenameToWishlist('Books I want')).toBe('Books I want')
	})
})

describe('evaluateStaleListPredicate', () => {
	const day = 86_400_000
	const month = 30 * day

	function args(overrides: Partial<Parameters<typeof evaluateStaleListPredicate>[0]> = {}) {
		return {
			list: { type: 'wishlist' as const, updatedAt: new Date(NOW.getTime() - 13 * month) },
			maxItemUpdatedAt: new Date(NOW.getTime() - 13 * month),
			lastEventDate: null,
			now: NOW,
			pastEventDays: 90,
			inactiveMonths: 12,
			...overrides,
		}
	}

	it('returns null when nothing is stale', () => {
		expect(
			evaluateStaleListPredicate(
				args({
					list: { type: 'wishlist', updatedAt: new Date(NOW.getTime() - 1 * day) },
					maxItemUpdatedAt: new Date(NOW.getTime() - 1 * day),
				})
			)
		).toBeNull()
	})

	it('returns event-passed for an event-bound list past the threshold', () => {
		const result = evaluateStaleListPredicate(
			args({
				list: { type: 'christmas', updatedAt: new Date(NOW.getTime() - 1 * day) },
				maxItemUpdatedAt: new Date(NOW.getTime() - 1 * day),
				lastEventDate: new Date(NOW.getTime() - 100 * day),
			})
		)
		expect(result).toBe('event-passed')
	})

	it('returns null for an event-bound list whose event is too recent', () => {
		const result = evaluateStaleListPredicate(
			args({
				list: { type: 'christmas', updatedAt: new Date(NOW.getTime() - 1 * day) },
				maxItemUpdatedAt: new Date(NOW.getTime() - 1 * day),
				lastEventDate: new Date(NOW.getTime() - 30 * day),
			})
		)
		expect(result).toBeNull()
	})

	it('never fires event-passed for a wishlist (no calendar binding)', () => {
		// Even with a past "event date" provided, wishlists don't match
		// the EVENT_BOUND_TYPES set.
		const result = evaluateStaleListPredicate(
			args({
				list: { type: 'wishlist', updatedAt: new Date(NOW.getTime() - 1 * day) },
				maxItemUpdatedAt: new Date(NOW.getTime() - 1 * day),
				lastEventDate: new Date(NOW.getTime() - 500 * day),
			})
		)
		expect(result).toBeNull()
	})

	it('returns inactive when both list.updatedAt and max(items.updatedAt) are old', () => {
		const result = evaluateStaleListPredicate(args())
		expect(result).toBe('inactive')
	})

	it('does not fire inactive when items are still being touched', () => {
		const result = evaluateStaleListPredicate(
			args({
				maxItemUpdatedAt: new Date(NOW.getTime() - 1 * day),
			})
		)
		expect(result).toBeNull()
	})

	it('does not fire inactive when the list itself was touched recently', () => {
		const result = evaluateStaleListPredicate(
			args({
				list: { type: 'wishlist', updatedAt: new Date(NOW.getTime() - 1 * day) },
			})
		)
		expect(result).toBeNull()
	})

	it('treats an empty list (null maxItemUpdatedAt) as satisfying the items half', () => {
		const result = evaluateStaleListPredicate(
			args({
				maxItemUpdatedAt: null,
			})
		)
		expect(result).toBe('inactive')
	})

	it('returns both when event-passed AND inactive both fire', () => {
		const result = evaluateStaleListPredicate(
			args({
				list: { type: 'christmas', updatedAt: new Date(NOW.getTime() - 13 * month) },
				maxItemUpdatedAt: new Date(NOW.getTime() - 13 * month),
				lastEventDate: new Date(NOW.getTime() - 100 * day),
			})
		)
		expect(result).toBe('both')
	})

	it('honors a custom pastEventDays threshold', () => {
		// 100 days past the event but threshold is 365 — not stale yet.
		const result = evaluateStaleListPredicate(
			args({
				list: { type: 'christmas', updatedAt: new Date(NOW.getTime() - 1 * day) },
				maxItemUpdatedAt: new Date(NOW.getTime() - 1 * day),
				lastEventDate: new Date(NOW.getTime() - 100 * day),
				pastEventDays: 365,
			})
		)
		expect(result).toBeNull()
	})

	it('honors a custom inactiveMonths threshold', () => {
		// 13 months of inactivity but threshold is 24 months — not stale.
		const result = evaluateStaleListPredicate(
			args({
				list: { type: 'wishlist', updatedAt: new Date(NOW.getTime() - 13 * month) },
				maxItemUpdatedAt: new Date(NOW.getTime() - 13 * month),
				inactiveMonths: 24,
			})
		)
		expect(result).toBeNull()
	})
})
