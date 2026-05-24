import { useEffect } from 'react'

import { useObservabilityStatus } from '@/hooks/use-observability-status'
import { initSentryClient } from '@/lib/observability/sentry-client'

// Reads the server-rendered observability status from the React Query
// cache (prefetched in __root.tsx's loader) and initializes the browser
// Sentry SDK once when enabled. Returns null - no DOM. Init happens at
// most once per page-load; flipping the admin toggle off in another tab
// does not stop SDK emission in already-loaded tabs (browser-SDK
// kill-switch limitation, documented at
// docs/configuration/observability).
export function SentryClientInit() {
	const { data } = useObservabilityStatus()

	useEffect(() => {
		const sentry = data?.sentry
		if (!sentry || !sentry.enabled || !sentry.dsn) return
		initSentryClient({
			dsn: sentry.dsn,
			environment: sentry.environment,
			release: sentry.release,
			tracesSampleRate: sentry.tracesSampleRate,
		})
	}, [data])

	return null
}
