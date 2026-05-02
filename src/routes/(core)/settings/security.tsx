import { createFileRoute } from '@tanstack/react-router'

import PasskeysSection from '@/components/settings/passkeys-section'
import PasswordForm from '@/components/settings/password-form'
import TwoFactorSection from '@/components/settings/two-factor-section'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useAppSetting } from '@/hooks/use-app-settings'

export const Route = createFileRoute('/(core)/settings/security')({
	component: SecurityPage,
})

function SecurityPage() {
	const passkeysEnabled = useAppSetting('enablePasskeys')
	return (
		<div className="animate-page-in gap-6 flex flex-col">
			<CardHeader className="">
				<CardTitle className="text-2xl">Security</CardTitle>
				<CardDescription>Change your password and security settings.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-8">
				<section className="space-y-3">
					<div>
						<h2 className="text-lg font-semibold">Password</h2>
						<p className="text-sm text-muted-foreground">Change the password you use to sign in.</p>
					</div>
					<PasswordForm />
				</section>

				<Separator />

				<section className="space-y-3">
					<div>
						<h2 className="text-lg font-semibold">Two-factor authentication</h2>
						<p className="text-sm text-muted-foreground">Use an authenticator app to require a one-time code on every sign-in.</p>
					</div>
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
		</div>
	)
}
