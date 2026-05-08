import type { Page } from 'playwright'

export type Theme = 'light' | 'dark'
export type ViewportName = 'mobile' | 'wide' | 'basic'

export interface Viewport {
	name: ViewportName
	width: number
	height: number
	isMobile: boolean
	hasTouch: boolean
	deviceScaleFactor: number
}

export const VIEWPORTS: Record<ViewportName, Viewport> = {
	mobile: {
		name: 'mobile',
		width: 390,
		height: 844,
		isMobile: true,
		hasTouch: true,
		deviceScaleFactor: 2,
	},
	basic: {
		name: 'basic',
		width: 1080,
		height: 1000,
		isMobile: false,
		hasTouch: false,
		deviceScaleFactor: 2,
	},
	wide: {
		name: 'wide',
		width: 1920,
		height: 1080,
		isMobile: false,
		hasTouch: false,
		deviceScaleFactor: 1,
	},
}

export const THEMES: ReadonlyArray<Theme> = ['light', 'dark']

export interface FixtureIds {
	generatedAt: string
	users: {
		admin: string
		partner: string
		friend: string
		gifter: string
		nobday: string
		child: string
		restrictedOwner: string
	}
	lists: {
		adminWishlist: number
		adminChristmas: number
		adminBirthday: number
		adminTodos: number
		adminPrivate: number
		adminIdeasForPartner: number
		partnerWishlist: number
		partnerBirthday: number
		partnerChristmas: number
		partnerIdeasForAdmin: number
		friendWishlist: number
		friendChristmas: number
		gifterWishlist: number
		gifterBirthday: number
		nobdayWishlist: number
		childWishlist: number
		childChristmas: number
		buddyWishlist: number
		restrictedOwnerWishlist: number
	}
}

export interface RouteDef {
	/** Filesystem-safe slug; used for output filenames. */
	slug: string
	/** Human-readable label for logs. */
	label: string
	/**
	 * URL path to navigate to. Either a literal string or a function that
	 * receives the fixture-IDs object. Always begins with `/`.
	 */
	path: string | ((ids: FixtureIds) => string)
	/** Whether the route requires an authenticated session (default true). */
	auth?: boolean
	/**
	 * CSS selector to wait for after navigation. Falls back to `body` if
	 * unset. Pick something specific to the page so we don't capture mid-load.
	 */
	waitFor?: string
	/** Per-route prep step (e.g. dismiss a banner, scroll, click a tab). */
	prep?: (page: Page) => Promise<void>
	/** Optional viewport override (defaults to all selected viewports). */
	viewports?: ReadonlyArray<ViewportName>
	/** Optional theme override (defaults to all selected themes). */
	themes?: ReadonlyArray<Theme>
}
