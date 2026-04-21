import { createServerFn } from '@tanstack/react-start'

import { loggingMiddleware } from '@/lib/logger'
import { isEmailConfigured as checkEmailConfigured } from '@/lib/resend'

export const isEmailConfigured = createServerFn({ method: 'GET' })
	.middleware([loggingMiddleware])
	.handler(() => {
		return checkEmailConfigured()
	})
