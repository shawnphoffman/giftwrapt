import { QueryClient, QueryClientProvider, useQueryErrorResetBoundary } from '@tanstack/react-query'

import { ErrorBoundary } from '@/components/utilities/error-boundary'
import { setupAppSettingsBroadcastListener } from '@/hooks/use-app-settings'

function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				// Retry failed queries once
				retry: 1,
				// Don't refetch on window focus in production
				refetchOnWindowFocus: process.env.NODE_ENV === 'development',
				// Data is considered fresh for 1 minute - prevents Suspense flash on tab focus
				staleTime: 1000 * 60,
			},
		},
	})
}

// Module-level consumers (e.g. TanStack DB collections in `db-collections/`)
// resolve their QueryClient at import time, while the Provider resolves it
// per router boot. If those were different instances, calling
// `queryClient.invalidateQueries(...)` from a component wouldn't touch a
// collection's cache - the component's client is the Provider's, and the
// collection was wired to a separate one. Reuse a single client on the
// browser so they share cache. Server-side, keep per-request clients so SSR
// requests don't leak state.
let browserQueryClient: QueryClient | null = null

export function getContext() {
	if (typeof window === 'undefined') {
		return { queryClient: makeQueryClient() }
	}
	if (!browserQueryClient) {
		browserQueryClient = makeQueryClient()
		// One-time wiring per browser session: listen for cross-tab app-settings
		// change notifications and invalidate the public settings cache so
		// feature gates (sidebar links, etc.) stay in sync across tabs.
		setupAppSettingsBroadcastListener(browserQueryClient)
	}
	return { queryClient: browserQueryClient }
}

function QueryErrorResetBoundary({ children }: { children: React.ReactNode }) {
	const { reset } = useQueryErrorResetBoundary()

	return (
		<ErrorBoundary
			onError={() => {
				// Reset React Query errors when error boundary catches an error
				// This allows queries to retry after the error boundary resets
				reset()
			}}
			fallback={(error, resetErrorBoundary) => {
				// Reset both the error boundary and React Query errors
				const handleReset = () => {
					reset()
					resetErrorBoundary()
				}

				return (
					<div className="flex flex-col items-center justify-center min-h-[400px] p-4">
						<div className="max-w-md space-y-4">
							<div className="text-center">
								<h2 className="text-lg font-semibold text-destructive mb-2">Query Error</h2>
								<p className="text-sm text-muted-foreground mb-4">{error.message || 'Failed to load data. Please try again.'}</p>
								<button
									onClick={handleReset}
									className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors"
								>
									Retry
								</button>
							</div>
						</div>
					</div>
				)
			}}
		>
			{children}
		</ErrorBoundary>
	)
}

export function Provider({ children, queryClient }: { children: React.ReactNode; queryClient: QueryClient }) {
	return (
		<QueryClientProvider client={queryClient}>
			<QueryErrorResetBoundary>{children}</QueryErrorResetBoundary>
		</QueryClientProvider>
	)
}
