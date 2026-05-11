import { createFileRoute } from '@tanstack/react-router'

import { AuthSettingsSection } from '@/components/admin/app-settings-editor'
import { OidcClientEditor } from '@/components/admin/oidc-client-editor'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
					<CardDescription>WebAuthn passkeys.</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<AuthSettingsSection />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-2xl">
				<CardHeader>
					<CardTitle className="text-2xl">OIDC sign-in</CardTitle>
					<CardDescription>
						Let users sign in with an external OpenID Connect provider. Single provider per deployment; changes take effect after a server
						restart.
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
