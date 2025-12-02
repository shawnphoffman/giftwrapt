import { Button } from '@/components/ui/button'
import { useCallback, useState } from 'react'
import { CheckIcon, XIcon, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { sendAdminTestEmail } from '@/lib/admin-server-functions'

export default function SendTestEmailButton() {
	const [sending, setSending] = useState(false)
	const [result, setResult] = useState<{ status?: string; error?: string }>()

	const Icon = !result || sending ? <Mail /> : result?.status === 'success' ? <CheckIcon /> : <XIcon />

	const handleClick = useCallback(async () => {
		setSending(true)
		setResult(undefined)

		try {
			await sendAdminTestEmail()
			setResult({
				status: 'success',
				error: undefined,
			})
			toast.success('Test email sent successfully')
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to send test email'
			setResult({
				status: 'error',
				error: errorMessage,
			})
			toast.error(errorMessage)
		} finally {
			setSending(false)
			setTimeout(() => {
				setResult(undefined)
			}, 3000)
		}
	}, [])

	return (
		<Button onClick={handleClick} variant="outline" className="gap-2 group" disabled={sending}>
			{Icon}
			{sending ? 'Sending...' : 'Send Test Email'}
		</Button>
	)
}
