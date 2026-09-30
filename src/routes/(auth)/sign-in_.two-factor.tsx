import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { TwoFactorChallengePageContent, type TwoFactorMode } from '@/components/auth/two-factor-challenge-page'
import { authClient } from '@/lib/auth-client'
import { safeRedirect } from '@/lib/safe-redirect'

type Search = { redirect?: string }

export const Route = createFileRoute('/(auth)/sign-in_/two-factor')({
	validateSearch: (search: Record<string, unknown>): Search => {
		return typeof search.redirect === 'string' ? { redirect: search.redirect } : {}
	},
	component: TwoFactorChallenge,
})

function TwoFactorChallenge() {
	const { redirect } = Route.useSearch()
	const [mode, setMode] = useState<TwoFactorMode>('totp')

	const goPostAuth = (data?: unknown) => {
		// Mid MCP OAuth flow, better-auth's `mcp()` plugin replays the
		// pending authorize request inside the verify response and answers
		// `{ redirect: true, url }` (the consent page). Follow it directly;
		// see the same handling in sign-in.tsx.
		const hook = data as { redirect?: boolean; url?: string } | null | undefined
		if (hook?.redirect === true && typeof hook.url === 'string' && hook.url.length > 0) {
			window.location.assign(hook.url)
			return
		}
		// Hard reload so the new session cookie is committed before
		// the next render, matching the sign-in route's strategy.
		window.location.assign(safeRedirect(redirect))
	}

	const handleTotp = async (code: string, trustDevice: boolean) => {
		const { data, error } = await authClient.twoFactor.verifyTotp({ code, trustDevice })
		if (error) throw new Error(error.message ?? 'invalid')
		goPostAuth(data)
	}

	const handleBackup = async (code: string) => {
		const { data, error } = await authClient.twoFactor.verifyBackupCode({ code })
		if (error) throw new Error(error.message ?? 'invalid')
		goPostAuth(data)
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
