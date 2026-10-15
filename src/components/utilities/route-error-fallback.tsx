import { Link } from '@tanstack/react-router'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { ChunkReloadFallback, useChunkReloadRecovery } from '@/components/utilities/chunk-reload-fallback'
import { isEmbeddedClient, postToNativeBridge } from '@/lib/embedded'
import { formatErrorForUser } from '@/lib/format-error'

interface RouteErrorFallbackProps {
	error: unknown
	reset?: () => void
	title?: string
	className?: string
}

export function RouteErrorFallback({ error, reset, title, className }: RouteErrorFallbackProps) {
	const recovering = useChunkReloadRecovery(error)
	const formatted = formatErrorForUser(error)
	const heading = title ?? formatted.title
	// Inside the iOS web tab the app shows its own card for this and
	// recovers through the handoff; the fallback below is still rendered
	// underneath for the moment the bridge takes to answer. A chunk reload
	// is recovering on its own, so it is not reported.
	useReportToNativeBridge(recovering ? null : formatted.body)
	if (recovering) {
		return <ChunkReloadFallback className={className ?? 'flex flex-col items-center justify-center min-h-100 gap-4 p-4 w-full'} />
	}

	return (
		<div className={className ?? 'flex flex-col items-center justify-center min-h-100 p-4 w-full'}>
			<div className="max-w-md space-y-4 text-center">
				<h2 className="text-lg font-semibold text-destructive">{heading}</h2>
				<p className="text-sm text-muted-foreground">{formatted.body}</p>
				{process.env.NODE_ENV === 'development' && error instanceof Error && error.stack ? (
					<details className="text-left text-xs text-muted-foreground/70">
						<summary className="cursor-pointer">Stack (dev only)</summary>
						<pre className="overflow-auto whitespace-pre-wrap break-all">{error.stack}</pre>
					</details>
				) : null}
				<div className="flex gap-2 justify-center">
					{reset ? (
						<Button onClick={reset} size="sm">
							Try again
						</Button>
					) : null}
					<Button asChild variant="outline" size="sm">
						<Link to="/" onClick={reset}>
							Go home
						</Link>
					</Button>
				</div>
			</div>
		</div>
	)
}

/**
 * Tell the iOS app (plan 28) that an error boundary rendered, once per
 * message. No-op in a browser and during SSR.
 */
export function useReportToNativeBridge(message: string | null): void {
	useEffect(() => {
		if (message === null || !isEmbeddedClient()) return
		postToNativeBridge({ type: 'error', message })
	}, [message])
}
