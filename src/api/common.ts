import { createServerFn } from '@tanstack/react-start'
import { env } from '@/env'

export const isEmailConfigured = createServerFn({ method: 'GET' }).handler(() => {
	return Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL)
})
