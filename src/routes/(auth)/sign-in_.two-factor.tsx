import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { EmbeddedReconnect } from '@/components/auth/embedded-reconnect'
import { TwoFactorChallengePageContent, type TwoFactorMode } from '@/components/auth/two-factor-challenge-page'
import { useEmbedded } from '@/hooks/use-embedded'
import { authClient } from '@/lib/auth-client'
import { safeRedirect } from '@/lib/safe-redirect'
import { pageHead } from '@/routes/-head'

type Search = { redirect?: string }

export const Route = createFileRoute('/(auth)/sign-in_/two-factor')({
	head: pageHead('Two-Factor Code'),
	validateSearch: (search: Record<string, unknown>): Search => {
		return typeof search.redirect === 'string' ? { redirect: search.redirect } : {}
	},
	component: TwoFactorChallenge,
})

function TwoFactorChallenge() {
	const { redirect } = Route.useSearch()
	const [mode, setMode] = useState<TwoFactorMode>('totp')
	const embedded = useEmbedded()

	// A handoff session carries the device key's standing and skips TOTP
	// (the key is the second factor); the web view never shows this
	// challenge. Landing here means the handoff needs re-running.
	if (embedded) return <EmbeddedReconnect to={safeRedirect(redirect)} />

	const goPostAuth = () => {
		// Hard reload so the new session cookie is committed before
		// the next render, matching the sign-in route's strategy. Mid MCP
		// OAuth flow `redirect` is the authorize relay (see sign-in.tsx).
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
