import { TanStackDevtools } from '@tanstack/react-devtools'
import { FormDevtoolsPanel } from '@tanstack/react-form-devtools'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Scripts } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { ThemeProvider } from 'next-themes'

import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ErrorBoundary } from '@/components/utilities/error-boundary'
import { appSettingsQueryOptions } from '@/hooks/use-app-settings'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import '../styles.css'
import ErrorBoundaryFallback from './-error-boundary'
import Head from './-head'
import NotFound from './-not-found'

interface RouterContext {
	queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
	head: Head,
	notFoundComponent: NotFound,
	shellComponent: RootDocument,
	beforeLoad: async ({ context }) => {
		// Prefetch app settings on server - will be hydrated to client
		await context.queryClient.ensureQueryData(appSettingsQueryOptions)
	},
})

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body>
				<ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
					<TooltipProvider>
						<ErrorBoundary fallback={(error, reset) => <ErrorBoundaryFallback error={error} reset={reset} />}>{children}</ErrorBoundary>
					</TooltipProvider>
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
