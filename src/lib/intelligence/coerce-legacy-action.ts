import type { RecommendationAction } from '@/components/intelligence/__fixtures__/types'

// Coerces legacy `RecommendationAction` shapes from persisted recs into the
// current canonical shape. Three legacy shapes exist:
//
// 1. Recs with `nav.listId === 'settings'` (the `relation-labels` analyzer
//    abused `listId` to point at /settings/ before the path-shaped nav
//    existed). Coerce to `{ path: '/settings/' }`.
// 2. Recs with `href: '/lists/...'` and no `nav`. Parse the href into
//    `{ listId, itemId? }`.
// 3. Recs with `intent: 'do'` and none of `href`, `apply`, or `editItem`.
//    Derive `nav` from the rec's list context so the action renders as a
//    link instead of falling through to the confirm-dialog path. `editItem`
//    is a canonical shape (the card opens the item's edit dialog inline), so
//    it must not be coerced into a nav link or the card would render it as
//    an external link and never reach the dialog.
//
// Pure helper so it can be unit-tested independently of the route.
export function coerceLegacyAction(rawAction: RecommendationAction, fallbackListId: string | null): RecommendationAction {
	const a = rawAction as RecommendationAction & { href?: string }
	if (a.nav && 'listId' in a.nav && a.nav.listId === 'settings') {
		return { ...a, nav: { path: '/settings/' } }
	}
	if (a.nav || a.apply || a.editItem) return rawAction
	if (a.href) {
		const m = /^\/lists\/([^#]+)(?:#item-(.+))?$/.exec(a.href)
		if (m) {
			const { href: _drop, ...rest } = a
			return { ...rest, nav: { listId: m[1], ...(m[2] ? { itemId: m[2] } : {}) } }
		}
	}
	if (a.intent === 'do' && fallbackListId) {
		return { ...rawAction, nav: { listId: fallbackListId } }
	}
	return rawAction
}
