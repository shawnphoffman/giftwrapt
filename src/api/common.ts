import { createServerFn } from '@tanstack/react-start'

import { loggingMiddleware } from '@/lib/logger'
import { getMetricsStatus, getSentryStatus } from '@/lib/observability/config'
import { isEmailConfigured as checkEmailConfigured } from '@/lib/resend'

export const isEmailConfigured = createServerFn({ method: 'GET' })
	.middleware([loggingMiddleware])
	.handler(async () => {
		return await checkEmailConfigured()
	})

export const getObservabilityStatus = createServerFn({ method: 'GET' })
	.middleware([loggingMiddleware])
	.handler(async () => {
		const [sentry, metrics] = await Promise.all([getSentryStatus(), getMetricsStatus()])
		return { sentry, metrics }
	})
