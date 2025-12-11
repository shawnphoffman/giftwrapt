import { env } from '@/env'

import appCss from '../styles.css?url'

export default function Head() {
	const isDeployed = process.env.NODE_ENV === 'production'
	const appTitle = env.VITE_APP_TITLE

	return {
		meta: [
			{
				charSet: 'utf-8',
			},
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1, minimum-scale=1, viewport-fit=cover',
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
				description: 'Sharing wish lists made easy.',
				openGraph: {
					title: appTitle,
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
				rel: 'stylesheet',
				href: appCss,
			},
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
