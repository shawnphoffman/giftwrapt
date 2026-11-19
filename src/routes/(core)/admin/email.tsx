import { createFileRoute } from '@tanstack/react-router'

import { EmailSettingsEditor } from '@/components/admin/email-settings-editor'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

export const Route = createFileRoute('/(core)/admin/email')({
	head: pageHead(() => m.page_email()),
	component: AdminEmailPage,
})

function AdminEmailPage() {
	return (
		<Card className="animate-page-in max-w-xl">
			<CardHeader>
				<CardTitle className="text-2xl">{m.admin_nav_email_title()}</CardTitle>
				<CardDescription>{m.admin_nav_email_description()}</CardDescription>
			</CardHeader>
			<CardContent>
				<ClientOnly>
					<EmailSettingsEditor />
				</ClientOnly>
			</CardContent>
		</Card>
	)
}
