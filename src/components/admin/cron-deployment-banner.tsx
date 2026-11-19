import { Triangle } from 'lucide-react'

import { RichMessage } from '@/components/common/rich-message'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { BUILD_INFO } from '@/lib/build-info'
import { m } from '@/paraglide/messages.js'

// Renders only on Vercel deployments. Vercel cron schedules are static
// in `vercel.json` (read at deploy time), so the admin can't edit them
// from this page; they live as a file in the repo. Tuning knobs that
// the cron handlers themselves consume (concurrency, users-per-tick,
// retention windows) are still editable in /admin and apply normally.

export function CronDeploymentBanner() {
	if (!BUILD_INFO.vercel) return null

	return (
		<Alert>
			<Triangle className="size-4" />
			<AlertTitle>{m.admin_settings_cron_vercel_banner_title()}</AlertTitle>
			<AlertDescription>
				<RichMessage parts={m.admin_settings_cron_vercel_banner_body.parts()} tags={{ code: children => <code>{children}</code> }} />
			</AlertDescription>
		</Alert>
	)
}
