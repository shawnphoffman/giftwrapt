import { createServerFn } from '@tanstack/react-start'

import { isEmailConfigured as checkEmailConfigured } from '@/lib/resend'

export const isEmailConfigured = createServerFn({ method: 'GET' }).handler(() => {
	return checkEmailConfigured()
})
