import type { Page } from 'playwright'

import type { RouteDef } from './types'

// `/lists/$id` redirects the OWNER to `/lists/$id/edit` (per
// `.notes/logic.md`'s recipient-identity rule). For admin-owned lists
// the view and edit URLs render the same screen, so we capture only
// the canonical entry point per list and skip the duplicate.
//
// `-organize` only meaningfully differs by list-type for wishlists; for
// the wishlist case we capture both tabs (Bulk Actions + Reorder) by
// pointing at the same URL with different `prep` steps. Other list
// types reuse the same organize component, so we skip the duplicates.
//
// Per-user list captures are intentionally pruned to one per
// distinguishing axis (gifter view, view-only, guardianship, dependent,
// restricted, sparse). Showing every user's wishlist is repetitive.

const clickReorderTab = async (page: Page) => {
	await page.getByRole('button', { name: 'Reorder' }).click()
}

export const ROUTES: ReadonlyArray<RouteDef> = [
	// ---------------------------------------------------------------- Logged out
	{ slug: 'sign-in', label: 'Sign in', path: '/sign-in', auth: false, waitFor: 'form' },
	{ slug: 'sign-in-mobile-passkey', label: 'Sign in: mobile passkey', path: '/sign-in/mobile-passkey', auth: false },
	{ slug: 'sign-in-two-factor', label: 'Sign in: two-factor', path: '/sign-in/two-factor', auth: false },
	{ slug: 'sign-up', label: 'Sign up', path: '/sign-up', auth: false, waitFor: 'form' },
	{ slug: 'forgot-password', label: 'Forgot password', path: '/forgot-password', auth: false, waitFor: 'form' },
	{ slug: 'reset-password', label: 'Reset password', path: '/reset-password', auth: false, waitFor: 'form' },

	// ---------------------------------------------------------------- Authenticated (admin)
	{ slug: 'home', label: 'Home / dashboard', path: '/' },
	{ slug: 'me', label: 'Profile', path: '/me' },
	{ slug: 'suggestions', label: 'Suggestions (intelligence)', path: '/suggestions' },

	{ slug: 'settings', label: 'Settings', path: '/settings' },
	{ slug: 'settings-security', label: 'Settings: security', path: '/settings/security' },
	{ slug: 'settings-permissions', label: 'Settings: permissions', path: '/settings/permissions' },
	{ slug: 'settings-devices', label: 'Settings: devices', path: '/settings/devices' },
	{ slug: 'settings-dependents', label: 'Settings: dependents', path: '/settings/dependents' },

	{ slug: 'purchases', label: 'Purchases (gave)', path: '/purchases' },
	{ slug: 'purchases-received', label: 'Purchases: received', path: '/purchases/received' },

	{ slug: 'recent-items', label: 'Recent items', path: '/recent/items' },
	{ slug: 'recent-comments', label: 'Recent comments', path: '/recent/comments' },

	// Admin's own lists - one capture per list-type variant.
	// `/lists/$id` redirects the owner to `/edit`, so just hit the view URL.
	{ slug: 'list-admin-wishlist', label: "Admin's primary wishlist", path: ids => `/lists/${ids.lists.adminWishlist}` },
	{
		slug: 'list-admin-wishlist-organize-bulk',
		label: 'Admin wishlist: organize (Bulk Actions tab)',
		path: ids => `/lists/${ids.lists.adminWishlist}/organize`,
	},
	{
		slug: 'list-admin-wishlist-organize-reorder',
		label: 'Admin wishlist: organize (Reorder tab)',
		path: ids => `/lists/${ids.lists.adminWishlist}/organize`,
		prep: clickReorderTab,
	},
	{ slug: 'list-admin-christmas', label: 'Admin christmas list', path: ids => `/lists/${ids.lists.adminChristmas}` },
	{ slug: 'list-admin-birthday', label: 'Admin birthday list', path: ids => `/lists/${ids.lists.adminBirthday}` },
	{ slug: 'list-admin-todos', label: 'Admin todos', path: ids => `/lists/${ids.lists.adminTodos}` },
	{ slug: 'list-admin-private', label: 'Admin private wishlist', path: ids => `/lists/${ids.lists.adminPrivate}` },
	{
		slug: 'list-admin-ideas-for-partner',
		label: 'Admin gift ideas (for partner)',
		path: ids => `/lists/${ids.lists.adminIdeasForPartner}`,
	},

	// Cross-user views, one per access-axis variant.
	{ slug: 'list-partner-wishlist', label: "Partner's wishlist (gifter view + groups)", path: ids => `/lists/${ids.lists.partnerWishlist}` },
	{
		slug: 'list-partner-wishlist-edit',
		label: "Partner's wishlist: edit (admin via canEdit)",
		path: ids => `/lists/${ids.lists.partnerWishlist}/edit`,
	},
	{ slug: 'list-gifter-wishlist', label: "Gifter's wishlist (view-only mode)", path: ids => `/lists/${ids.lists.gifterWishlist}` },
	{ slug: 'list-nobday-wishlist', label: "Nobday's sparse wishlist", path: ids => `/lists/${ids.lists.nobdayWishlist}` },
	{ slug: 'list-child-wishlist', label: "Child's wishlist (admin via guardianship)", path: ids => `/lists/${ids.lists.childWishlist}` },
	{
		slug: 'list-child-wishlist-edit',
		label: "Child's wishlist: edit (admin via guardianship)",
		path: ids => `/lists/${ids.lists.childWishlist}/edit`,
	},

	// Dependent-subject list (Buddy the pet).
	{ slug: 'list-buddy', label: "Buddy's wishlist (dependent subject)", path: ids => `/lists/${ids.lists.buddyWishlist}` },
	{ slug: 'list-buddy-edit', label: "Buddy's wishlist: edit", path: ids => `/lists/${ids.lists.buddyWishlist}/edit` },

	// Restricted-viewer surface.
	{
		slug: 'list-restricted',
		label: "Sky's wishlist (admin is restricted viewer)",
		path: ids => `/lists/${ids.lists.restrictedOwnerWishlist}`,
	},

	// 404 / not-found rendering.
	{ slug: 'not-found', label: 'Not found (404)', path: '/this-route-does-not-exist' },

	// Admin panel
	{ slug: 'admin', label: 'Admin', path: '/admin' },
	{ slug: 'admin-email', label: 'Admin: email', path: '/admin/email' },
	{ slug: 'admin-auth', label: 'Admin: auth', path: '/admin/auth' },
	{ slug: 'admin-users', label: 'Admin: users', path: '/admin/users' },
	{ slug: 'admin-user-detail', label: 'Admin: user detail', path: ids => `/admin/user/${ids.users.partner}` },
	{ slug: 'admin-scraping', label: 'Admin: scraping', path: '/admin/scraping' },
	{ slug: 'admin-ai', label: 'Admin: ai', path: '/admin/ai' },
	{ slug: 'admin-data', label: 'Admin: data', path: '/admin/data' },
	{ slug: 'admin-scheduling', label: 'Admin: scheduling', path: '/admin/scheduling' },
	{ slug: 'admin-storage', label: 'Admin: storage', path: '/admin/storage' },

	// Intelligence admin
	{ slug: 'admin-intelligence', label: 'Admin: intelligence', path: '/admin/intelligence' },
	{ slug: 'admin-intelligence-settings', label: 'Admin: intelligence: settings', path: '/admin/intelligence/settings' },
	{ slug: 'admin-intelligence-analyzers', label: 'Admin: intelligence: analyzers', path: '/admin/intelligence/analyzers' },
	{ slug: 'admin-intelligence-scheduling', label: 'Admin: intelligence: scheduling', path: '/admin/intelligence/scheduling' },
	{ slug: 'admin-intelligence-notifications', label: 'Admin: intelligence: notifications', path: '/admin/intelligence/notifications' },
	{ slug: 'admin-intelligence-history', label: 'Admin: intelligence: history', path: '/admin/intelligence/history' },
]
