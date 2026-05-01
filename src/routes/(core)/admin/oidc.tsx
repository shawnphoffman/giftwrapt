import { createFileRoute } from '@tanstack/react-router'

import { OidcClientsEditor } from '@/components/admin/oidc-clients-editor'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'

export const Route = createFileRoute('/(core)/admin/oidc')({
	component: AdminOidcPage,
})

function AdminOidcPage() {
	return (
		<Card className="animate-page-in max-w-4xl">
			<CardHeader>
				<CardTitle className="text-2xl">OIDC clients</CardTitle>
				<CardDescription>
					Register third-party apps that can "Sign in with GiftWrapt". The discovery document is at{' '}
					<code className="text-xs">/.well-known/openid-configuration</code>; clients exchange authorization codes at{' '}
					<code className="text-xs">/oauth2/token</code> and read profile data from <code className="text-xs">/oauth2/userinfo</code>.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ClientOnly>
					<OidcClientsEditor />
				</ClientOnly>
			</CardContent>
		</Card>
	)
}
