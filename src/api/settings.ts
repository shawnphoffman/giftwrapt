import { createServerFn } from '@tanstack/react-start'

import { db } from '@/db'
import { getAppSettings } from '@/lib/settings'

/**
 * Server function to fetch app settings
 * This runs on the server and returns typed, validated settings
 */
export const fetchAppSettings = createServerFn({
	method: 'GET',
}).handler(async () => {
	return await getAppSettings(db)
})
