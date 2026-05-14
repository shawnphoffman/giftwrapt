import { createFileRoute } from '@tanstack/react-router'

import { AuthSettingsSection } from '@/components/admin/app-settings-editor'
import { MobileAppEditor } from '@/components/admin/mobile-app-editor'
import { OidcClientEditor } from '@/components/admin/oidc-client-editor'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ClientOnly } from '@/components/utilities/client-only'

export const Route = createFileRoute('/(core)/admin/auth')({
	component: AdminAuthPage,
})

function AdminAuthPage() {
	return (
		<>
			<Card className="animate-page-in max-w-2xl">
				<CardHeader>
					<CardTitle className="text-2xl">Auth</CardTitle>
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
					<CardTitle className="text-2xl">OIDC Sign-in</CardTitle>
					<CardDescription>
						Let users sign in with an external OpenID Connect provider. Single provider per deployment; changes take effect after a server
						restart. iOS sign-in additionally requires at least one mobile redirect URI above.
					</CardDescription>
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
