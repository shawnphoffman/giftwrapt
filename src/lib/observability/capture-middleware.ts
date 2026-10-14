import { createMiddleware } from '@tanstack/react-start'

// Global server-fn middleware (registered in src/start.ts) that reports
// every server fn failure to Sentry. TanStack Start catches a server fn's
// error and serializes it into a 500 response itself, so it never reaches
// Nitro's error hook; this is the only place those errors are visible.
//
// Redirects and notFound() never land in the catch: TanStack hands them
// back through ctx.error rather than throwing.
//
// No-op without SENTRY_DSN (captureServerException returns immediately).
// The import is dynamic and window-gated, like loggingMiddleware's, so the
// client bundle never pulls in @sentry/node.
export const errorCaptureMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
	try {
		return await next()
	} catch (err) {
		if (typeof window === 'undefined') {
			const { captureServerException } = await import('@/lib/observability/sentry-server')
			await captureServerException(err, { source: 'server-fn' })
		}
		throw err
	}
})
