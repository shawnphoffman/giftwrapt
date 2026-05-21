import { CheckIcon, Mail, XIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { sendTestEmailAsAdmin } from '@/api/admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TEST_EMAIL_KINDS, type TestEmailKind } from '@/lib/resend'

export default function SendTestEmailButton({ defaultRecipient = '' }: { defaultRecipient?: string }) {
	const [sending, setSending] = useState(false)
	const [kind, setKind] = useState<TestEmailKind>('test')
	const [recipient, setRecipient] = useState(defaultRecipient)
	const [result, setResult] = useState<{ status?: string; error?: string }>()

	useEffect(() => {
		setRecipient(defaultRecipient)
	}, [defaultRecipient])

	const Icon = !result || sending ? <Mail /> : result.status === 'success' ? <CheckIcon /> : <XIcon />

	const handleClick = useCallback(async () => {
		setSending(true)
		setResult(undefined)

		try {
			await sendTestEmailAsAdmin({ data: { kind, to: recipient.trim() || undefined } })
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
	}, [kind, recipient])

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<Label htmlFor="test-email-recipient" className="text-base">
					Recipient
				</Label>
				<p className="text-sm text-muted-foreground">Defaults to your BCC address, or the From address if no BCC is set.</p>
				<Input
					id="test-email-recipient"
					type="email"
					value={recipient}
					placeholder="you@example.com"
					disabled={sending}
					onChange={e => setRecipient(e.target.value)}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="test-email-kind" className="text-base">
					Template
				</Label>
				<p className="text-sm text-muted-foreground">Pick which transactional email to render with sample data.</p>
				<Select value={kind} onValueChange={value => setKind(value as TestEmailKind)} disabled={sending}>
					<SelectTrigger id="test-email-kind" className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{TEST_EMAIL_KINDS.map(option => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="flex justify-end">
				<Button onClick={handleClick} variant="outline" className="gap-2 group" disabled={sending}>
					{Icon}
					{sending ? 'Sending...' : 'Send Test Email'}
				</Button>
			</div>
		</div>
	)
}
