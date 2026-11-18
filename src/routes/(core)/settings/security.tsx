import { createFileRoute } from '@tanstack/react-router'

import PasskeysSection from '@/components/settings/passkeys-section'
import PasswordForm from '@/components/settings/password-form'
import TwoFactorSection from '@/components/settings/two-factor-section'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useAppSetting } from '@/hooks/use-app-settings'
import { useEmbedded } from '@/hooks/use-embedded'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

export const Route = createFileRoute('/(core)/settings/security')({
	head: pageHead(() => m.page_security()),
	component: SecurityPage,
})

function SecurityPage() {
	// Passkeys cannot be registered or used inside the iOS web tab (no
	// per-host associated domain in a tenant-agnostic WKWebView), so the
	// section is hidden there (plan 28). Password and TOTP still work.
	const embedded = useEmbedded()
	const passkeysEnabled = useAppSetting('enablePasskeys') && !embedded
	return (
		<Card className="animate-page-in max-w-2xl">
			<CardHeader>
				<CardTitle className="text-2xl">{m.page_security()}</CardTitle>
				<CardDescription>{m.settings_security_description()}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<section className="space-y-3">
					<div>
						<h2 className="text-lg font-semibold">{m.settings_password_title()}</h2>
						<p className="text-sm text-muted-foreground">{m.settings_password_description()}</p>
					</div>
					<PasswordForm />
				</section>

				<Separator />

				<section className="space-y-3">
					<TwoFactorSection />
				</section>

				{passkeysEnabled && (
					<>
						<Separator />
						<section className="space-y-3">
							<div>
								<h2 className="text-lg font-semibold">{m.settings_passkeys_title()}</h2>
								<p className="text-sm text-muted-foreground">{m.settings_passkeys_description()}</p>
							</div>
							<PasskeysSection />
						</section>
					</>
				)}
			</CardContent>
		</Card>
	)
}
