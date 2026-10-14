import { definePlugin as defineNitroPlugin } from 'nitro'
import { isEvent } from 'nitro/h3'

import { env } from '@/env'
import { buildContentSecurityPolicy } from '@/lib/csp'

// Sets the Content-Security-Policy on every response, the same way Nitro's
// `headers` route rule does (event.res.headers at request time), but from
// the runtime env instead of the build env. Computed once here: SENTRY_DSN
// and VERCEL_ENV are fixed for the life of the process. HSTS stays a route
// rule in vite.config.ts since it doesn't depend on the environment.
export default defineNitroPlugin(nitroApp => {
	const csp = buildContentSecurityPolicy({ sentryDsn: env.SENTRY_DSN, vercelEnv: process.env.VERCEL_ENV })

	// The hook is typed with h3's minimal HTTPEvent; Nitro passes a full
	// H3Event, which is what carries the response headers.
	nitroApp.hooks.hook('request', event => {
		if (isEvent(event)) event.res.headers.set('Content-Security-Policy', csp)
	})
})
