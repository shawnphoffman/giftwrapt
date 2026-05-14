import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { TwoFactorChallengePageContent, type TwoFactorMode } from '@/components/auth/two-factor-challenge-page'
import { authClient } from '@/lib/auth-client'
import { safeRedirect } from '@/lib/safe-redirect'

type Search = { redirect?: string }

export const Route = createFileRoute('/(auth)/sign-in/two-factor')({
	validateSearch: (search: Record<string, unknown>): Search => {
		return typeof search.redirect === 'string' ? { redirect: search.redirect } : {}
	},
	component: TwoFactorChallenge,
})

function TwoFactorChallenge() {
	const { redirect } = Route.useSearch()
	const [mode, setMode] = useState<TwoFactorMode>('totp')

	const goPostAuth = () => {
		// Hard reload so the new session cookie is committed before
		// the next render, matching the sign-in route's strategy.
		window.location.assign(safeRedirect(redirect))
	}

	const handleTotp = async (code: string, trustDevice: boolean) => {
		const { error } = await authClient.twoFactor.verifyTotp({ code, trustDevice })
		if (error) throw new Error(error.message ?? 'invalid')
		goPostAuth()
	}

	const handleBackup = async (code: string) => {
		const { error } = await authClient.twoFactor.verifyBackupCode({ code })
		if (error) throw new Error(error.message ?? 'invalid')
		goPostAuth()
	}

	return (
		<TwoFactorChallengePageContent
			mode={mode}
			onModeChange={setMode}
			onSubmitTotp={handleTotp}
			onSubmitBackupCode={handleBackup}
			signInHref="/sign-in"
		/>
	)
}
