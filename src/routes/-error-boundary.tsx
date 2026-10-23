import { Button } from '@/components/ui/button'
import { ChunkReloadFallback, useChunkReloadRecovery } from '@/components/utilities/chunk-reload-fallback'
import { useReportToNativeBridge } from '@/components/utilities/route-error-fallback'
import { formatErrorForUser } from '@/lib/format-error'

interface ErrorBoundaryFallbackProps {
	error: Error
	reset: () => void
}

export default function ErrorBoundaryFallback({ error, reset }: ErrorBoundaryFallbackProps) {
	const recovering = useChunkReloadRecovery(error)
	const formatted = formatErrorForUser(error)
	// The iOS web tab replaces this page with a native card (plan 28).
	useReportToNativeBridge(recovering ? null : formatted.body)
	if (recovering) return <ChunkReloadFallback />

	return (
		<div className="flex flex-col items-center justify-center min-h-screen p-4">
			<div className="max-w-md space-y-4 text-center">
				<h1 className="text-2xl font-bold text-destructive">{formatted.title}</h1>
				<p className="text-muted-foreground">{formatted.body}</p>
				<div className="flex gap-2 justify-center">
					<Button type="button" onClick={reset}>
						Try again
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={() => {
							window.location.href = '/'
						}}
					>
						Go home
					</Button>
				</div>
			</div>
		</div>
	)
}
