import { createFileRoute } from '@tanstack/react-router'

import PasskeysSection from '@/components/settings/passkeys-section'
import PasswordForm from '@/components/settings/password-form'
import TwoFactorSection from '@/components/settings/two-factor-section'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useAppSetting } from '@/hooks/use-app-settings'
import { useEmbedded } from '@/hooks/use-embedded'

export const Route = createFileRoute('/(core)/settings/security')({
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
				<CardTitle className="text-2xl">Security</CardTitle>
				<CardDescription>Change your password and security settings.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<section className="space-y-3">
					<div>
						<h2 className="text-lg font-semibold">Password</h2>
						<p className="text-sm text-muted-foreground">Change the password you use to sign in.</p>
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
								<h2 className="text-lg font-semibold">Passkeys</h2>
								<p className="text-sm text-muted-foreground">
									Add Touch ID, Face ID, or hardware security keys as a faster way to sign in. Each device gets its own passkey.
								</p>
							</div>
							<PasskeysSection />
						</section>
					</>
				)}
			</CardContent>
		</Card>
	)
}
