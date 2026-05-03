import { createLogger } from '@/lib/logger'
import type { AppSettings } from '@/lib/settings'

const log = createLogger('intelligence-notify')

// Scaffold-only hook. v1 ships with email delivery toggles wired in the
// admin UI but no transport. A future PR replaces this implementation
// with a real Resend call.
export type RunCompletion = {
	userId: string
	runId: string
	status: 'success' | 'error' | 'skipped'
	recCount: number
}

export function notifyForRun(args: { settings: AppSettings; run: RunCompletion }): void {
	if (!args.settings.intelligenceEmailEnabled) return
	if (!args.settings.intelligenceEmailWeeklyDigestEnabled) return
	log.info(
		{ run: args.run, recipient: args.settings.intelligenceEmailTestRecipient ?? 'user' },
		'would send digest (delivery scaffold only)'
	)
}
