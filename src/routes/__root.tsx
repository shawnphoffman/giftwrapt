import '../styles.css'

import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Scripts, useRouterState } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getCookie, getRequestHeaders } from '@tanstack/react-start/server'
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
import { readTextSizeCookie, resolveTextSize, TEXT_SIZE_COOKIE, type TextSize, textSizeStyle } from '@/lib/text-size'

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
//
// The text size (plan 30c) comes the same way: the `gw-text-size` cookie on
// the server, `document.cookie` on the client, so the shell can put it on
// <html> during SSR and the first paint is already at the chosen size.
const readShellRequest = createServerFn({ method: 'GET' }).handler(() => {
	return {
		embedded: isEmbeddedUserAgent(getRequestHeaders().get('user-agent')),
		textSizeCookie: getCookie(TEXT_SIZE_COOKIE) ?? null,
	}
})

async function detectShell(): Promise<{ embedded: boolean; textSize: TextSize }> {
	if (typeof window === 'undefined') {
		const { embedded, textSizeCookie } = await readShellRequest()
		return { embedded, textSize: resolveTextSize({ cookie: textSizeCookie, embedded }) }
	}
	const embedded = isEmbeddedUserAgent(window.navigator.userAgent)
	return { embedded, textSize: resolveTextSize({ cookie: readTextSizeCookie(document.cookie), embedded }) }
}

export const Route = createRootRouteWithContext<RouterContext>()({
	// `loader` must precede `head`: TanStack Router's type inference flows
	// from earlier properties to later ones, and `head` (Head) consumes the
	// loader's returned `appTitle`. Ordering head first breaks that inference.
	loader: async ({ context }) => {
		const { embedded, textSize } = await detectShell()
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
			return { appTitle: settings.appTitle, embedded, textSize }
		} catch {
			return { appTitle: 'GiftWrapt', embedded, textSize }
		}
	},
	head: Head,
	notFoundComponent: NotFound,
	shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
	// Router state rather than useLoaderData: the shell also renders when the
	// root loader has not produced data (an error), and then stays at 100%.
	const textSize = useRouterState({
		select: st => (st.matches.find(m => m.routeId === '__root__')?.loaderData as { textSize?: TextSize } | undefined)?.textSize,
	})
	return (
		<html lang="en" className="dark" style={textSize ? textSizeStyle(textSize) : undefined} suppressHydrationWarning>
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
