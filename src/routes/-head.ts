import appCss from '../styles.css?url'

export default function Head() {
	const isDeployed = process.env.NODE_ENV === 'production'

	return {
		meta: [
			{
				charSet: 'utf-8',
			},
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1, minimum-scale=1',
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
				title: `Wish Lists 2.0 ${isDeployed ? '' : '| Dev'}`,
				description: 'Sharing wish lists made easy.',
				openGraph: {
					title: 'Wish Lists 2.0',
					description: 'Sharing wish lists made easy.',
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
				content: 'black',
			},
			{
				name: 'apple-mobile-web-app-title',
				content: 'Wish Lists',
			},
		],
		links: [
			{
				rel: 'stylesheet',
				href: appCss,
			},
			{
				rel: 'icon',
				href: '/favicon.ico',
			},
			{
				rel: 'apple-touch-icon',
				href: '/apple-touch-icon.png',
			},
		],
	}
}
