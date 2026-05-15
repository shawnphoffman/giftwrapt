import '../styles.css'

import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Scripts } from '@tanstack/react-router'
import { ThemeProvider } from 'next-themes'

import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ErrorBoundary } from '@/components/utilities/error-boundary'
import { appSettingsQueryOptions } from '@/hooks/use-app-settings'
import { storageStatusQueryOptions } from '@/hooks/use-storage-status'

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
	loader: async ({ context }) => {
		// Prefetch app settings + storage status on server; both hydrate to
		// client. Run in parallel since neither depends on the other.
		// Wrapped in try-catch so a transient DB hiccup (cold-start pool
		// exhaustion, network blip) renders the error boundary with a
		// usable fallback instead of blanking the page. The static
		// fallbacks come from DEFAULT_APP_SETTINGS via the schema's
		// defaults; head reads `appTitle` out of the returned object.
		try {
			const [settings] = await Promise.all([
				context.queryClient.ensureQueryData(appSettingsQueryOptions),
				context.queryClient.ensureQueryData(storageStatusQueryOptions),
			])
			return { appTitle: settings.appTitle }
		} catch {
			return { appTitle: 'GiftWrapt' }
		}
	},
})

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className="dark" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body>
				<ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
					<TooltipProvider>
						<ErrorBoundary fallback={(error, reset) => <ErrorBoundaryFallback error={error} reset={reset} />}>{children}</ErrorBoundary>
					</TooltipProvider>
					<Scripts />
					<Toaster />
				</ThemeProvider>
			</body>
		</html>
	)
}
