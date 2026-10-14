import { definePlugin as defineNitroPlugin } from 'nitro'

import { initSentryServer } from '@/lib/observability/sentry-server'

// Init Sentry at boot so the SDK's unhandled-rejection and
// uncaught-exception handlers are live from the start. Not load-bearing for
// captureServerException, which inits lazily (see sentry-server.ts for why).
// No-op when SENTRY_DSN isn't set; the admin toggle (enableSentry in
// app_settings) gates each event in beforeSend.
export default defineNitroPlugin(() => {
	initSentryServer()
})
