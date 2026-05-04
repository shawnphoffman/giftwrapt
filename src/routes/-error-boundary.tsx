interface ErrorBoundaryFallbackProps {
	error: Error
	reset: () => void
}

export default function ErrorBoundaryFallback({ error, reset }: ErrorBoundaryFallbackProps) {
	return (
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
					<button
						onClick={() => {
							window.location.href = '/'
						}}
						className="px-4 py-2 text-sm font-medium border border-input bg-background rounded-md hover:bg-accent transition-colors"
					>
						Go home
					</button>
				</div>
			</div>
		</div>
	)
}
