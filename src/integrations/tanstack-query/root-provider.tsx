import { QueryClient, QueryClientProvider, useQueryErrorResetBoundary } from '@tanstack/react-query'
import { ErrorBoundary } from '@/components/utilities/error-boundary'

export function getContext() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				// Retry failed queries once
				retry: 1,
				// Don't refetch on window focus in production
				refetchOnWindowFocus: process.env.NODE_ENV === 'development',
			},
		},
	})
	return {
		queryClient,
	}
}

function QueryErrorResetBoundary({ children }: { children: React.ReactNode }) {
	const { reset } = useQueryErrorResetBoundary()

	return (
		<ErrorBoundary
			onError={(error) => {
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
								<p className="text-sm text-muted-foreground mb-4">
									{error.message || 'Failed to load data. Please try again.'}
								</p>
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
