import { useState } from 'react'
import { toast } from 'sonner'

import { getTotpQrSvg } from '@/api/totp-qr'
import { type EnrollmentPayload, TwoFactorPanelContent, type TwoFactorStatus } from '@/components/settings/two-factor-panel'
import { authClient, useSession } from '@/lib/auth-client'
import { authError, errorText, UserFacingError } from '@/lib/i18n/errors'
import { m } from '@/paraglide/messages.js'

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

	const guard = async (fallback: () => string, fn: () => Promise<void>) => {
		setError(null)
		setBusy(true)
		try {
			await fn()
		} catch (err) {
			setError(errorText(err, fallback()))
			throw err
		} finally {
			setBusy(false)
		}
	}

	const handleStartEnrollment = (password: string) =>
		guard(
			() => m.settings_2fa_enable_error(),
			async () => {
				const { data, error: enableError } = await authClient.twoFactor.enable({ password })
				if (enableError) throw authError(enableError, m.settings_2fa_wrong_password())
				// Render the panel immediately with the secret/codes; fetch the
				// server-rendered QR SVG asynchronously and patch it in when
				// it arrives. See `src/api/totp-qr.ts` for the why
				// (CSP `'unsafe-eval'` removal).
				setEnrollment({ totpURI: data.totpURI, backupCodes: data.backupCodes, qrSvg: null })
				setStatus('enrolling')
				void getTotpQrSvg({ data: { totpURI: data.totpURI } })
					.then(({ svg }) => {
						setEnrollment(prev => (prev && prev.totpURI === data.totpURI ? { ...prev, qrSvg: svg } : prev))
					})
					.catch(err => {
						setError(errorText(err, m.settings_2fa_qr_error()))
					})
			}
		)

	const handleVerifyEnrollment = (code: string) =>
		guard(
			() => m.settings_2fa_verify_error(),
			async () => {
				const { error: verifyError } = await authClient.twoFactor.verifyTotp({ code })
				if (verifyError) throw new UserFacingError(m.settings_2fa_code_mismatch())
				toast.success(m.settings_2fa_enabled_toast())
				// Surface backup codes once verification succeeds: they
				// were issued at enable() time, but we hold them off-screen
				// until the user actually completes the verify step so a
				// half-finished enrollment doesn't leave codes orphaned.
				setPendingBackupCodes(enrollment?.backupCodes ?? null)
				setEnrollment(null)
				setStatus('enabled')
				await refetch()
			}
		)

	const handleCancelEnrollment = () => {
		setEnrollment(null)
		setStatus('disabled')
	}

	const handleDisable = (password: string) =>
		guard(
			() => m.settings_2fa_disable_error(),
			async () => {
				const { error: disableError } = await authClient.twoFactor.disable({ password })
				if (disableError) throw authError(disableError, m.settings_2fa_wrong_password())
				toast.success(m.settings_2fa_disabled_toast())
				setStatus('disabled')
				setEnrollment(null)
				setPendingBackupCodes(null)
				await refetch()
			}
		)

	const handleRegenerate = (password: string) =>
		guard(
			() => m.settings_2fa_regenerate_error(),
			async () => {
				const { data, error: regenError } = await authClient.twoFactor.generateBackupCodes({ password })
				if (regenError) throw authError(regenError, m.settings_2fa_wrong_password())
				setPendingBackupCodes(data.backupCodes)
				toast.success(m.settings_2fa_backup_codes_ready_toast())
			}
		)

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
