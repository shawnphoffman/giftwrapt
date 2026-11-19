import { createFileRoute } from '@tanstack/react-router'

import { AuthSettingsSection } from '@/components/admin/app-settings-editor'
import { MobileAppEditor } from '@/components/admin/mobile-app-editor'
import { OidcClientEditor } from '@/components/admin/oidc-client-editor'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ClientOnly } from '@/components/utilities/client-only'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

export const Route = createFileRoute('/(core)/admin/auth')({
	head: pageHead(() => m.page_authentication()),
	component: AdminAuthPage,
})

function AdminAuthPage() {
	return (
		<>
			<Card className="animate-page-in max-w-2xl">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_nav_auth_title()}</CardTitle>
				</CardHeader>
				<CardContent className="space-y-6">
					<ClientOnly>
						<AuthSettingsSection />
					</ClientOnly>
					<Separator />
					<ClientOnly>
						<MobileAppEditor />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-2xl">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_nav_auth_oidc_title()}</CardTitle>
					<CardDescription>{m.admin_nav_auth_oidc_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<OidcClientEditor />
					</ClientOnly>
				</CardContent>
			</Card>
		</>
	)
}
