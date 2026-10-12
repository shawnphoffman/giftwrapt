interface HeadCtx {
	loaderData?: { appTitle?: string }
}

const DEV_SUFFIX = process.env.NODE_ENV === 'production' ? '' : ' | Dev'

/** "<tenant title> - <page>", the document title every page carries. */
export function pageTitle(appTitle: string, page: string): string {
	return `${appTitle} - ${page}${DEV_SUFFIX}`
}

type PageHeadCtx<T> = {
	matches: ReadonlyArray<{ loaderData?: unknown }>
	loaderData?: T
}

type PageHeadResult = { meta: Array<{ title: string }> }

/**
 * A route `head` that titles the page "<tenant title> - <page>". The tenant
 * title comes from the root loader (`matches[0]`), so every route shares one
 * source. `page` is a string or a function of the route's own loader data
 * (a list page uses the list name). The deepest route's title wins, so a
 * layout route can set a section title and children refine it. The iOS web
 * tab shows the part after the tenant prefix in its native bar.
 */
export function pageHead(page: string): (ctx: PageHeadCtx<unknown>) => PageHeadResult
export function pageHead<T>(page: (loaderData: T | undefined) => string): (ctx: PageHeadCtx<T>) => PageHeadResult
export function pageHead<T>(page: string | ((loaderData: T | undefined) => string)) {
	return (ctx: PageHeadCtx<T>): PageHeadResult => {
		const root = ctx.matches[0]?.loaderData as { appTitle?: string } | undefined
		const name = typeof page === 'function' ? page(ctx.loaderData) : page
		return { meta: [{ title: pageTitle(root?.appTitle ?? 'GiftWrapt', name) }] }
	}
}

export default function Head(ctx: HeadCtx = {}) {
	const isDeployed = process.env.NODE_ENV === 'production'
	const appTitle = ctx.loaderData?.appTitle ?? 'GiftWrapt'

	return {
		meta: [
			{
				charSet: 'utf-8',
			},
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1, minimum-scale=1, viewport-fit=cover, interactive-widget=resizes-content',
			},
			{
				name: 'theme-color',
				content: '#0a0a0a',
			},
			{
				name: 'color-scheme',
				content: 'dark',
			},
			{
				title: `${appTitle} ${isDeployed ? '' : '| Dev'}`,
				description: 'Wish lists made easy.',
				openGraph: {
					title: appTitle,
					description: 'Wish lists made easy.',
					type: 'website',
					url: '/',
					locale: 'en_US',
				},
			},
			// Apple Web App meta tags
			{
				name: 'apple-mobile-web-app-capable',
				content: 'yes',
			},
			{
				name: 'apple-mobile-web-app-status-bar-style',
				content: 'black-translucent',
			},
			{
				name: 'apple-mobile-web-app-title',
				content: appTitle,
			},
			// PWA / Mobile App meta tags
			{
				name: 'mobile-web-app-capable',
				content: 'yes',
			},
			{
				name: 'application-name',
				content: appTitle,
			},
			{
				name: 'format-detection',
				content: 'telephone=no',
			},
		],
		links: [
			{
				rel: 'manifest',
				href: '/manifest.json',
			},
			{
				rel: 'icon',
				href: '/favicon.ico',
			},
			{
				rel: 'icon',
				type: 'image/png',
				sizes: '16x16',
				href: '/favicon-16x16.png',
			},
			{
				rel: 'icon',
				type: 'image/png',
				sizes: '32x32',
				href: '/favicon-32x32.png',
			},
			{
				rel: 'apple-touch-icon',
				sizes: '180x180',
				href: '/apple-touch-icon.png',
			},
		],
	}
}
