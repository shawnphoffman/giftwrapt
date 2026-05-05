import type { RouteDef } from './types'

export const ROUTES: ReadonlyArray<RouteDef> = [
	// ---------------------------------------------------------------- Logged out
	{ slug: 'sign-in', label: 'Sign in', path: '/sign-in', auth: false, waitFor: 'form' },
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

	// Admin's own lists
	{ slug: 'list-admin-wishlist', label: "Admin's primary wishlist", path: ids => `/lists/${ids.lists.adminWishlist}` },
	{ slug: 'list-admin-wishlist-edit', label: 'Admin wishlist: edit', path: ids => `/lists/${ids.lists.adminWishlist}/edit` },
	{ slug: 'list-admin-wishlist-organize', label: 'Admin wishlist: organize', path: ids => `/lists/${ids.lists.adminWishlist}/organize` },
	{ slug: 'list-admin-christmas', label: 'Admin christmas list', path: ids => `/lists/${ids.lists.adminChristmas}` },
	{ slug: 'list-admin-birthday', label: 'Admin birthday list', path: ids => `/lists/${ids.lists.adminBirthday}` },
	{ slug: 'list-admin-todos', label: 'Admin todos', path: ids => `/lists/${ids.lists.adminTodos}` },
	{ slug: 'list-admin-private', label: 'Admin private wishlist', path: ids => `/lists/${ids.lists.adminPrivate}` },
	{
		slug: 'list-admin-ideas-for-partner',
		label: 'Admin gift ideas (for partner)',
		path: ids => `/lists/${ids.lists.adminIdeasForPartner}`,
	},

	// Cross-user views (admin viewing as gifter / claimer)
	{ slug: 'list-partner-wishlist', label: "Partner's wishlist (gifter view)", path: ids => `/lists/${ids.lists.partnerWishlist}` },
	{ slug: 'list-partner-birthday', label: "Partner's birthday list", path: ids => `/lists/${ids.lists.partnerBirthday}` },
	{ slug: 'list-partner-christmas', label: "Partner's christmas list", path: ids => `/lists/${ids.lists.partnerChristmas}` },
	{ slug: 'list-friend-wishlist', label: "Friend's wishlist (gifter view)", path: ids => `/lists/${ids.lists.friendWishlist}` },
	{ slug: 'list-friend-christmas', label: "Friend's christmas list", path: ids => `/lists/${ids.lists.friendChristmas}` },
	{ slug: 'list-gifter-wishlist', label: "Gifter's wishlist (view-only gifter mode)", path: ids => `/lists/${ids.lists.gifterWishlist}` },
	{ slug: 'list-gifter-birthday', label: "Gifter's birthday list", path: ids => `/lists/${ids.lists.gifterBirthday}` },
	{ slug: 'list-nobday-wishlist', label: "Nobday's sparse wishlist", path: ids => `/lists/${ids.lists.nobdayWishlist}` },
	{ slug: 'list-child-wishlist', label: "Child's wishlist", path: ids => `/lists/${ids.lists.childWishlist}` },
	{ slug: 'list-child-christmas', label: "Child's christmas list", path: ids => `/lists/${ids.lists.childChristmas}` },

	// Admin panel
	{ slug: 'admin', label: 'Admin', path: '/admin' },
	{ slug: 'admin-email', label: 'Admin: email', path: '/admin/email' },
	{ slug: 'admin-auth', label: 'Admin: auth', path: '/admin/auth' },
	{ slug: 'admin-users', label: 'Admin: users', path: '/admin/users' },
	{ slug: 'admin-scraping', label: 'Admin: scraping', path: '/admin/scraping' },
	{ slug: 'admin-ai', label: 'Admin: ai', path: '/admin/ai' },
	{ slug: 'admin-data', label: 'Admin: data', path: '/admin/data' },
	{ slug: 'admin-scheduling', label: 'Admin: scheduling', path: '/admin/scheduling' },
	{ slug: 'admin-storage', label: 'Admin: storage', path: '/admin/storage' },
	// { slug: 'admin-debug', label: 'Admin: debug', path: '/admin/debug' },

	// Admin panel
	{ slug: 'admin-intelligence', label: 'Admin: intelligence', path: '/admin/intelligence' },
	{ slug: 'admin-intelligence-settings', label: 'Admin: intelligence: settings', path: '/admin/intelligence/settings' },
	{ slug: 'admin-intelligence-analyzers', label: 'Admin: intelligence: analyzers', path: '/admin/intelligence/analyzers' },
	{ slug: 'admin-intelligence-scheduling', label: 'Admin: intelligence: scheduling', path: '/admin/intelligence/scheduling' },
	{ slug: 'admin-intelligence-notifications', label: 'Admin: intelligence: notifications', path: '/admin/intelligence/notifications' },
	{ slug: 'admin-intelligence-history', label: 'Admin: intelligence: history', path: '/admin/intelligence/history' },
]
