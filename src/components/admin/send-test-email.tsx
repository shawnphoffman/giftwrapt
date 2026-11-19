import { CheckIcon, Mail, XIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { sendTestEmailAsAdmin } from '@/api/admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TEST_EMAIL_KINDS, type TestEmailKind } from '@/lib/resend'
import { m } from '@/paraglide/messages.js'

// One label per kind; the switch makes TypeScript fail when a kind is added
// to TEST_EMAIL_KINDS without one.
function testEmailKindLabel(kind: TestEmailKind): string {
	switch (kind) {
		case 'test':
			return m.admin_settings_email_kind_test()
		case 'new-comment':
			return m.admin_settings_email_kind_new_comment()
		case 'birthday':
			return m.admin_settings_email_kind_birthday()
		case 'post-birthday':
			return m.admin_settings_email_kind_post_birthday()
		case 'pre-birthday-reminder':
			return m.admin_settings_email_kind_pre_birthday_reminder()
		case 'pre-christmas-reminder':
			return m.admin_settings_email_kind_pre_christmas_reminder()
		case 'pre-custom-holiday-reminder':
			return m.admin_settings_email_kind_pre_custom_holiday_reminder()
		case 'parental-relations-reminder':
			return m.admin_settings_email_kind_parental_relations_reminder()
		case 'valentines-day-reminder':
			return m.admin_settings_email_kind_valentines_day_reminder()
		case 'partner-anniversary-reminder':
			return m.admin_settings_email_kind_partner_anniversary_reminder()
		case 'orphan-claim':
			return m.admin_settings_email_kind_orphan_claim()
		case 'orphan-claim-cleanup-reminder':
			return m.admin_settings_email_kind_orphan_claim_cleanup_reminder()
		case 'post-holiday':
			return m.admin_settings_email_kind_post_holiday()
		case 'password-reset':
			return m.admin_settings_email_kind_password_reset()
		case 'intelligence-operator-digest':
			return m.admin_settings_email_kind_intelligence_operator_digest()
	}
}

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
			toast.success(m.admin_settings_email_test_sent())
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : m.admin_settings_email_test_failed()
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
					{m.admin_settings_email_test_recipient_label()}
				</Label>
				<p className="text-sm text-muted-foreground">{m.admin_settings_email_test_recipient_description()}</p>
				<Input
					id="test-email-recipient"
					type="email"
					value={recipient}
					// eslint-disable-next-line i18next/no-literal-string -- sample address
					placeholder="you@example.com"
					disabled={sending}
					onChange={e => setRecipient(e.target.value)}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="test-email-kind" className="text-base">
					{m.admin_settings_email_test_template_label()}
				</Label>
				<p className="text-sm text-muted-foreground">{m.admin_settings_email_test_template_description()}</p>
				<Select value={kind} onValueChange={value => setKind(value as TestEmailKind)} disabled={sending}>
					<SelectTrigger id="test-email-kind" className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{TEST_EMAIL_KINDS.map(option => (
							<SelectItem key={option.value} value={option.value}>
								{testEmailKindLabel(option.value)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="flex justify-end">
				<Button onClick={handleClick} variant="outline" className="gap-2 group" disabled={sending}>
					{Icon}
					{sending ? m.admin_settings_email_test_sending() : m.admin_settings_email_test_send_button()}
				</Button>
			</div>
		</div>
	)
}
