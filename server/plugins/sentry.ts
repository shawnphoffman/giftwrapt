import { definePlugin as defineNitroPlugin } from 'nitro'

import { initSentryServer } from '@/lib/observability/sentry-server'

// Init Sentry as early as possible so the logging plugin's error hook
// can capture exceptions through the same SDK instance. No-op when
// SENTRY_DSN isn't set; the admin toggle (enableSentry in app_settings)
// gates per-event emission inside captureServerException.
export default defineNitroPlugin(() => {
	initSentryServer()
})
