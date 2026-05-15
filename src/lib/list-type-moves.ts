// Predicate shared between `moveItemsToListImpl` (clears claims when a
// move would cross the spoiler-protection boundary) and the intelligence
// `merge-lists` apply branch (uses it as an assertion: the duplicate-
// event-lists rec only ever proposes same-type or matching-customHolidayId
// merges, so this MUST return false for any list pair the rec generated;
// if it ever returns true the apply aborts with internal-error rather
// than silently degrading into the destructive branch).
//
// Same-type moves are never destructive. Moves wholly within the
// spoiler-protected set (wishlist/christmas/birthday) preserve claim
// semantics. Everything else (giftideas <-> anything, todos <-> anything,
// holiday <-> anything) clears claims.

import type { ListType } from '@/db/schema/enums'

export const SPOILER_PROTECTED_TYPES: ReadonlySet<ListType> = new Set(['wishlist', 'christmas', 'birthday'])

export function isCrossTypeMoveDestructive(sourceType: ListType, targetType: ListType): boolean {
	if (sourceType === targetType) return false
	if (SPOILER_PROTECTED_TYPES.has(sourceType) && SPOILER_PROTECTED_TYPES.has(targetType)) return false
	return true
}
