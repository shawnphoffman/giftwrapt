import { HeadContent, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { FormDevtoolsPanel } from '@tanstack/react-form-devtools'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
	queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{
				charSet: 'utf-8',
			},
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1',
			},
			{
				title: `Wish Lists 2.0 ${process.env.NODE_ENV === 'production' ? '' : '| Dev'}`,
				description: 'Sharing wish lists made easy.',
				openGraph: {
					title: 'Wish Lists 2.0',
					description: 'Sharing wish lists made easy.',
					type: 'website',
					url: '/',
					locale: 'en_US',
				},
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
		],
	}),

	notFoundComponent: () => (
		<div className="flex flex-col items-center justify-center min-h-screen">
			<h1 className="text-4xl font-bold mb-4">404 - Not Found</h1>
			<p className="text-muted-foreground mb-8">The page you're looking for doesn't exist.</p>
			<a href="/" className="text-primary hover:underline">
				Go back home
			</a>
		</div>
	),

	shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className="dark">
			<head>
				<HeadContent />
			</head>
			<body>
				{/* <Header /> */}
				{children}
				<TanStackDevtools
					config={{
						position: 'bottom-right',
					}}
					plugins={[
						{
							name: 'Tanstack Router',
							render: <TanStackRouterDevtoolsPanel />,
						},
						TanStackQueryDevtools,
						{
							name: 'TanStack Form',
							render: <FormDevtoolsPanel />,
							defaultOpen: true,
						},
					]}
				/>
				<Scripts />
			</body>
		</html>
	)
}
