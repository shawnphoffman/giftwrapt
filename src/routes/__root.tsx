import { TanStackDevtools } from '@tanstack/react-devtools'
import { FormDevtoolsPanel } from '@tanstack/react-form-devtools'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Link, Scripts } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'

import { Toaster } from '@/components/ui/sonner'
import { ErrorBoundary } from '@/components/utilities/error-boundary'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
// import '@fontsource-variable/open-sans/'
import appCss from '../styles.css?url'

interface RouterContext {
	queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
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
			<Link to="/" className="text-primary hover:underline">
				Go back home
			</Link>
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
				<ErrorBoundary
					fallback={(error, reset) => (
						<div className="flex flex-col items-center justify-center min-h-screen p-4">
							<div className="max-w-md space-y-4 text-center">
								<h1 className="text-2xl font-bold text-destructive">Application Error</h1>
								<p className="text-muted-foreground">{error.message || 'An unexpected error occurred. Please refresh the page.'}</p>
								<div className="flex gap-2 justify-center">
									<button
										onClick={reset}
										className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors"
									>
										Try again
									</button>
									<Link
										to="/"
										className="px-4 py-2 text-sm font-medium border border-input bg-background rounded-md hover:bg-accent transition-colors"
									>
										Go home
									</Link>
								</div>
							</div>
						</div>
					)}
				>
					{children}
				</ErrorBoundary>
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
				<Toaster />
			</body>
		</html>
	)
}
