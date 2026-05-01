import { createFileRoute } from '@tanstack/react-router'

import PasswordForm from '@/components/settings/password-form'
import TwoFactorSection from '@/components/settings/two-factor-section'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

type Search = { enroll?: '2fa' }

export const Route = createFileRoute('/(core)/settings/security')({
	validateSearch: (search: Record<string, unknown>): Search => {
		return search.enroll === '2fa' ? { enroll: '2fa' } : {}
	},
	component: SecurityPage,
})

function SecurityPage() {
	const { enroll } = Route.useSearch()
	return (
		<div className="animate-page-in gap-6 flex flex-col">
			<CardHeader className="">
				<CardTitle className="text-2xl">Security</CardTitle>
				<CardDescription>Change your password and security settings.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-8">
				{enroll === '2fa' && (
					<Alert>
						<AlertTitle>Two-factor authentication required</AlertTitle>
						<AlertDescription>
							This server requires admins to have 2FA enrolled. Enable it below to access the admin tools.
						</AlertDescription>
					</Alert>
				)}

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
			</CardContent>
		</div>
	)
}
