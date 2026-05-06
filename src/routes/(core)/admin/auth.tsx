import { createFileRoute } from '@tanstack/react-router'

import { AuthSettingsSection } from '@/components/admin/app-settings-editor'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'

export const Route = createFileRoute('/(core)/admin/auth')({
	component: AdminAuthPage,
})

function AdminAuthPage() {
	return (
		<Card className="animate-page-in max-w-xl">
			<CardHeader>
				<CardTitle className="text-2xl">Auth</CardTitle>
				<CardDescription>Two-factor enforcement and WebAuthn passkeys.</CardDescription>
			</CardHeader>
			<CardContent>
				<ClientOnly>
					<AuthSettingsSection />
				</ClientOnly>
			</CardContent>
		</Card>
	)
}
