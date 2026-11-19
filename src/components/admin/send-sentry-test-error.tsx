import { Bug } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { sendSentryTestErrorAsAdmin } from '@/api/admin'
import { Button } from '@/components/ui/button'
import { m } from '@/paraglide/messages.js'

// The server fn always fails; that failure is the test. By the time the
// rejection reaches the browser the server has already flushed the event.
export function SendSentryTestErrorButton() {
	const [sending, setSending] = useState(false)

	const handleClick = useCallback(async () => {
		setSending(true)
		try {
			await sendSentryTestErrorAsAdmin()
		} catch {
			toast.success(m.admin_settings_sentry_test_sent())
		} finally {
			setSending(false)
		}
	}, [])

	return (
		<Button onClick={handleClick} variant="outline" size="sm" className="gap-2" disabled={sending}>
			<Bug />
			{sending ? m.admin_settings_sentry_test_sending() : m.admin_settings_sentry_test_send_button()}
		</Button>
	)
}
