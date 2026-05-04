import { useState } from 'react'
import { toast } from 'sonner'

import { type EnrollmentPayload, TwoFactorPanelContent, type TwoFactorStatus } from '@/components/settings/two-factor-panel'
import { authClient, useSession } from '@/lib/auth-client'

// Wrapper around TwoFactorPanelContent that drives the calls to
// better-auth's plugin endpoints. Splitting the form/state from the
// API plumbing keeps the panel storyable without a real auth client.
export default function TwoFactorSection() {
	const { data: session, refetch } = useSession()
	const [status, setStatus] = useState<TwoFactorStatus | null>(null)
	const [enrollment, setEnrollment] = useState<EnrollmentPayload | null>(null)
	const [pendingBackupCodes, setPendingBackupCodes] = useState<Array<string> | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)

	const initial: TwoFactorStatus = session?.user.twoFactorEnabled ? 'enabled' : 'disabled'
	const effective: TwoFactorStatus = status ?? initial

	const guard = async (action: string, fn: () => Promise<void>) => {
		setError(null)
		setBusy(true)
		try {
			await fn()
		} catch (err) {
			setError(err instanceof Error ? err.message : `Couldn't ${action}.`)
		} finally {
			setBusy(false)
		}
	}

	const handleStartEnrollment = (password: string) =>
		guard('enable two-factor auth', async () => {
			const { data, error: enableError } = await authClient.twoFactor.enable({ password })
			if (enableError) throw new Error(enableError.message ?? 'Wrong password.')
			setEnrollment({ totpURI: data.totpURI, backupCodes: data.backupCodes })
			setStatus('enrolling')
		})

	const handleVerifyEnrollment = (code: string) =>
		guard('verify the code', async () => {
			const { error: verifyError } = await authClient.twoFactor.verifyTotp({ code })
			if (verifyError) throw new Error("Code didn't match. Check your authenticator and try again.")
			toast.success('Two-factor auth enabled')
			// Surface backup codes once verification succeeds: they
			// were issued at enable() time, but we hold them off-screen
			// until the user actually completes the verify step so a
			// half-finished enrollment doesn't leave codes orphaned.
			setPendingBackupCodes(enrollment?.backupCodes ?? null)
			setEnrollment(null)
			setStatus('enabled')
			await refetch()
		})

	const handleCancelEnrollment = () => {
		setEnrollment(null)
		setStatus('disabled')
	}

	const handleDisable = (password: string) =>
		guard('disable two-factor auth', async () => {
			const { error: disableError } = await authClient.twoFactor.disable({ password })
			if (disableError) throw new Error(disableError.message ?? 'Wrong password.')
			toast.success('Two-factor auth disabled')
			setStatus('disabled')
			setEnrollment(null)
			setPendingBackupCodes(null)
			await refetch()
		})

	const handleRegenerate = (password: string) =>
		guard('regenerate backup codes', async () => {
			const { data, error: regenError } = await authClient.twoFactor.generateBackupCodes({ password })
			if (regenError) throw new Error(regenError.message ?? 'Wrong password.')
			setPendingBackupCodes(data.backupCodes)
			toast.success('New backup codes ready')
		})

	return (
		<TwoFactorPanelContent
			status={effective}
			enrollment={enrollment}
			pendingBackupCodes={pendingBackupCodes}
			error={error}
			busy={busy}
			onStartEnrollment={handleStartEnrollment}
			onVerifyEnrollment={handleVerifyEnrollment}
			onCancelEnrollment={handleCancelEnrollment}
			onDisable={handleDisable}
			onRegenerateBackupCodes={handleRegenerate}
			onDismissBackupCodes={() => setPendingBackupCodes(null)}
		/>
	)
}
