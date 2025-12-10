import { TanStackDevtools } from '@tanstack/react-devtools'
import { FormDevtoolsPanel } from '@tanstack/react-form-devtools'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Scripts } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { ThemeProvider } from 'next-themes'

import { Toaster } from '@/components/ui/sonner'
import { ErrorBoundary } from '@/components/utilities/error-boundary'
import type { Database } from '@/db'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import ErrorBoundaryFallback from './-error-boundary'
import Head from './-head'
import NotFound from './-not-found'

interface RouterContext {
	queryClient: QueryClient
	db: Database
}

export const Route = createRootRouteWithContext<RouterContext>()({
	head: Head,
	notFoundComponent: NotFound,
	shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body>
				<ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
					<ErrorBoundary fallback={(error, reset) => <ErrorBoundaryFallback error={error} reset={reset} />}>{children}</ErrorBoundary>
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
				</ThemeProvider>
			</body>
		</html>
	)
}
