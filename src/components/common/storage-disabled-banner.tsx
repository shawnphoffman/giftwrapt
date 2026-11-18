import { AlertTriangle } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useStorageStatus } from '@/hooks/use-storage-status'
import { m } from '@/paraglide/messages.js'

// Shown on the admin page when the server is missing any of the five required
// STORAGE_* env vars. Image uploads are gracefully disabled in that mode
// (upload buttons hidden, upload endpoints 503). Operators will see this after
// a fresh Vercel deploy without storage env vars; adding them and redeploying
// dismisses the banner.
export function StorageDisabledBanner() {
	const { configured } = useStorageStatus()
	if (configured) return null
	return (
		<Alert variant="destructive" className="max-w-xl">
			<AlertTriangle />
			<AlertTitle>{m.shared_storage_disabled_title()}</AlertTitle>
			<AlertDescription>{m.shared_storage_disabled_description()}</AlertDescription>
		</Alert>
	)
}
