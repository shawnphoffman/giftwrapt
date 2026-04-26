import { createServerFn } from '@tanstack/react-start'

import { isStorageConfigured } from '@/lib/storage/adapter'

// Exposes whether object storage is configured so the client can hide upload
// controls and show a banner when it isn't. Driven entirely by env; does not
// hit storage. Safe to prefetch at app shell load.
export const fetchStorageStatus = createServerFn({ method: 'GET' }).handler(() => {
	return { configured: isStorageConfigured() }
})
