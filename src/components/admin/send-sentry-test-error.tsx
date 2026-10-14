import { Bug } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { sendSentryTestErrorAsAdmin } from '@/api/admin'
import { Button } from '@/components/ui/button'

// The server fn always fails; that failure is the test. By the time the
// rejection reaches the browser the server has already flushed the event.
export function SendSentryTestErrorButton() {
	const [sending, setSending] = useState(false)

	const handleClick = useCallback(async () => {
		setSending(true)
		try {
			await sendSentryTestErrorAsAdmin()
		} catch {
			toast.success('Test error sent. It should show up in Sentry as SentryTestError within a minute.')
		} finally {
			setSending(false)
		}
	}, [])

	return (
		<Button onClick={handleClick} variant="outline" size="sm" className="gap-2" disabled={sending}>
			<Bug />
			{sending ? 'Sending...' : 'Send Test Error'}
		</Button>
	)
}
