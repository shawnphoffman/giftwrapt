import { useEffect, useState } from 'react'

import Loading from '@/components/loading'
import { attemptChunkReload, isChunkLoadError } from '@/lib/chunk-reload'

/**
 * Drives stale-chunk recovery from inside an error boundary's fallback.
 *
 * When a route's lazy chunk 404s after a deploy, TanStack Router handles the
 * rejection itself and surfaces it through its `errorComponent` - the global
 * `window` chunk-reload handler never fires for that path. So the fallback has
 * to kick off the (guarded) reload itself instead of rendering the scary
 * "something went wrong" page.
 *
 * Returns true while a reload is pending (caller should render
 * `ChunkReloadFallback`). Returns false for non-chunk errors, on the server, or
 * once the bounded reload budget is exhausted - in which case the caller falls
 * through to the real error UI so a genuinely broken deploy is still visible.
 */
export function useChunkReloadRecovery(error: unknown): boolean {
	// Only recover on the client: a chunk error during SSR is a different
	// problem (a server-side import failure), and `attemptChunkReload` is a no-op
	// on the server anyway.
	const [recovering, setRecovering] = useState(() => typeof window !== 'undefined' && isChunkLoadError(error))

	useEffect(() => {
		if (!recovering) return
		const reloadStarted = attemptChunkReload()
		// Budget exhausted: stop showing the spinner and let the real error render.
		if (!reloadStarted) setRecovering(false)
	}, [recovering])

	return recovering
}

export function ChunkReloadFallback({ className }: { className?: string }) {
	return (
		<div className={className ?? 'flex flex-col items-center justify-center min-h-screen gap-4 p-4'}>
			<Loading />
			<p className="text-sm text-muted-foreground">Loading the latest version…</p>
		</div>
	)
}
