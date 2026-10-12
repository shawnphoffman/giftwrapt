import '../styles.css'

import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Scripts } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { ThemeProvider } from 'next-themes'

import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ErrorBoundary } from '@/components/utilities/error-boundary'
import { NavPerfTimer } from '@/components/utilities/nav-perf-timer'
import { SentryClientInit } from '@/components/utilities/sentry-client-init'
import { appSettingsQueryOptions } from '@/hooks/use-app-settings'
import { observabilityStatusQueryOptions } from '@/hooks/use-observability-status'
import { storageStatusQueryOptions } from '@/hooks/use-storage-status'
import { isEmbeddedUserAgent } from '@/lib/embedded'
import { captureClientException } from '@/lib/observability/sentry-client'

import ErrorBoundaryFallback from './-error-boundary'
import Head from './-head'
import NotFound from './-not-found'

interface RouterContext {
	queryClient: QueryClient
}

// Is this request coming from the iOS app's web tab? Read off the request
// User-Agent on the server; on the client the same marker is in
// `navigator.userAgent`. Both sides agree, so there is no hydration drift.
// Read in the root loader so every route (auth pages included) sees the
// same answer via `useEmbedded()`. See src/lib/embedded.ts.
const readEmbedded = createServerFn({ method: 'GET' }).handler(() => {
	return { embedded: isEmbeddedUserAgent(getRequestHeaders().get('user-agent')) }
})

async function detectEmbedded(): Promise<boolean> {
	if (typeof window === 'undefined') {
		const { embedded } = await readEmbedded()
		return embedded
	}
	return isEmbeddedUserAgent(window.navigator.userAgent)
}

export const Route = createRootRouteWithContext<RouterContext>()({
	// `loader` must precede `head`: TanStack Router's type inference flows
	// from earlier properties to later ones, and `head` (Head) consumes the
	// loader's returned `appTitle`. Ordering head first breaks that inference.
	loader: async ({ context }) => {
		const embedded = await detectEmbedded()
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
				context.queryClient.ensureQueryData(observabilityStatusQueryOptions),
			])
			return { appTitle: settings.appTitle, embedded }
		} catch {
			return { appTitle: 'GiftWrapt', embedded }
		}
	},
	head: Head,
	notFoundComponent: NotFound,
	shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className="dark" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body>
				<ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
					<SentryClientInit />
					<NavPerfTimer />
					<TooltipProvider>
						<ErrorBoundary
							fallback={(error, reset) => <ErrorBoundaryFallback error={error} reset={reset} />}
							onError={error => captureClientException(error)}
						>
							{children}
						</ErrorBoundary>
					</TooltipProvider>
					<Scripts />
					<Toaster />
				</ThemeProvider>
			</body>
		</html>
	)
}
