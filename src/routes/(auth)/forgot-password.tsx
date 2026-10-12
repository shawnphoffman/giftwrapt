import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import { EmbeddedReconnect } from '@/components/auth/embedded-reconnect'
import { ForgotPasswordPageContent } from '@/components/auth/forgot-password-page'
import { useEmbedded } from '@/hooks/use-embedded'
import { authClient, useSession } from '@/lib/auth-client'
import { isEmailConfigured } from '@/lib/resend'

// Server-side gate: tell the page whether the operator has wired up
// Resend so the form can render an explanatory disabled state instead
// of pretending to send an email and silently dropping it. Email-config
// status is per-deploy (env var or admin-DB row) so we resolve it on
// every load. No point caching for a setting an admin can flip live.
const checkEmailEnabled = createServerFn({ method: 'GET' }).handler(async () => {
	const enabled = await isEmailConfigured()
	return { enabled }
})

export const Route = createFileRoute('/(auth)/forgot-password')({
	beforeLoad: ({ context }) => {
		// If the user already has a session, send them home. This page
		// is only useful while signed-out. Mirrors the sign-in pattern of
		// not gawking at auth pages once authenticated.
		const session = context as { session?: { user?: unknown } } | undefined
		if (session?.session?.user) throw redirect({ to: '/' })
	},
	loader: async () => {
		const { enabled } = await checkEmailEnabled()
		return { emailEnabled: enabled }
	},
	component: ForgotPassword,
})

function ForgotPassword() {
	const { emailEnabled } = Route.useLoaderData()
	const { data: session } = useSession()
	const embedded = useEmbedded()

	if (session?.user) return null
	// Password recovery is a browser affair; the iOS web tab signs in by
	// handoff and never shows an auth form (plan 28).
	if (embedded) return <EmbeddedReconnect to="/" />

	const handleSubmit = async (email: string) => {
		// Better-auth's `forgetPassword` always returns ok regardless of
		// whether the email exists, so we don't get a useful error to
		// surface, and that's fine: the page UI shows the same "if an
		// account exists you'll receive an email" message either way to
		// avoid leaking which addresses are registered.
		await authClient.requestPasswordReset({
			email,
			redirectTo: '/reset-password',
		})
	}

	return <ForgotPasswordPageContent onSubmit={handleSubmit} signInHref="/sign-in" emailEnabled={emailEnabled} />
}
