import { createFileRoute } from '@tanstack/react-router'

import { ResetPasswordPageContent } from '@/components/auth/reset-password-page'
import { authClient } from '@/lib/auth-client'

type ResetSearch = { token?: string }

export const Route = createFileRoute('/(auth)/reset-password')({
	validateSearch: (search: Record<string, unknown>): ResetSearch => {
		// Better-auth appends `?token=…&error=…` when redirecting from
		// the reset-password verification endpoint. We only care about
		// the token; an invalid/expired token is reported when the user
		// submits, not on page load, so we still render the form.
		const token = typeof search.token === 'string' ? search.token : undefined
		return token ? { token } : {}
	},
	component: ResetPassword,
})

function ResetPassword() {
	const { token } = Route.useSearch()

	const handleSubmit = async (newPassword: string) => {
		if (!token) throw new Error('missing-token')
		const { error } = await authClient.resetPassword({
			newPassword,
			token,
		})
		if (error) throw new Error(error.message ?? 'reset-failed')
	}

	return <ResetPasswordPageContent onSubmit={handleSubmit} signInHref="/sign-in" tokenPresent={Boolean(token)} />
}
