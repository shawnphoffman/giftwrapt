import { createFileRoute } from '@tanstack/react-router'

import { EmailSettingsEditor } from '@/components/admin/email-settings-editor'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'

export const Route = createFileRoute('/(core)/admin/email')({
	component: AdminEmailPage,
})

function AdminEmailPage() {
	return (
		<Card className="animate-page-in">
			<CardHeader>
				<CardTitle className="text-2xl">Email</CardTitle>
				<CardDescription>
					Configure the Resend integration used for all transactional email. Values provided via environment variables take precedence and
					cannot be edited here.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ClientOnly>
					<EmailSettingsEditor />
				</ClientOnly>
			</CardContent>
		</Card>
	)
}
