import { Eye, EyeOff } from 'lucide-react'
import { useEffect, useState } from 'react'

import { getTotpQrSvg } from '@/api/totp-qr'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { cn } from '@/lib/utils'

// User-facing state for the 2FA section. Drives the panel's UI:
//
//   disabled  – not enrolled. CTA: "Enable two-factor auth".
//   enrolling – password collected, awaiting QR + verification code.
//   enabled   – done. Show status + "manage backup codes" / "disable" CTAs.
export type TwoFactorStatus = 'disabled' | 'enrolling' | 'enabled'

export type EnrollmentPayload = {
	totpURI: string
	backupCodes: Array<string>
}

export type TwoFactorPanelContentProps = {
	status: TwoFactorStatus
	enrollment: EnrollmentPayload | null
	pendingBackupCodes?: Array<string> | null
	error?: string | null
	busy?: boolean
	onStartEnrollment: (password: string) => Promise<void> | void
	onVerifyEnrollment: (code: string) => Promise<void> | void
	onCancelEnrollment: () => void
	onDisable: (password: string) => Promise<void> | void
	onRegenerateBackupCodes: (password: string) => Promise<void> | void
	onDismissBackupCodes?: () => void
}

const TOTP_CODE_LENGTH = 6
const BACKUP_CODE_DELIMITER = '-'

export function TwoFactorPanelContent(props: TwoFactorPanelContentProps) {
	const { status, enrollment, pendingBackupCodes, error, busy } = props
	return (
		<div className="space-y-4">
			{status === 'disabled' && <DisabledView {...props} />}
			{status === 'enrolling' && enrollment && <EnrollingView {...props} enrollment={enrollment} />}
			{status === 'enabled' && <EnabledView {...props} />}

			{pendingBackupCodes && pendingBackupCodes.length > 0 && (
				<BackupCodesPanel codes={pendingBackupCodes} onDismiss={props.onDismissBackupCodes} />
			)}

			{error && (
				<Alert variant="destructive">
					<AlertTitle>Couldn't update 2FA</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{busy && <p className="text-xs text-muted-foreground">Working…</p>}
		</div>
	)
}

function DisabledView({ onStartEnrollment, busy }: TwoFactorPanelContentProps) {
	const [password, setPassword] = useState('')
	const [submitting, setSubmitting] = useState(false)

	const handle = async (e: React.FormEvent) => {
		e.preventDefault()
		setSubmitting(true)
		try {
			await onStartEnrollment(password)
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<div className="space-y-3">
			<div className="space-y-1">
				<p className="text-sm">
					Two-factor authentication adds a one-time code from an app like 1Password, Authy, or Google Authenticator on top of your password.
				</p>
				<p className="text-xs text-muted-foreground">Enter your current password to begin enrollment.</p>
			</div>
			<form onSubmit={handle} className="flex flex-col gap-2 sm:flex-row sm:items-end">
				<div className="grid gap-2 flex-1">
					<Label htmlFor="enable-2fa-password">Current password</Label>
					<PasswordInput
						id="enable-2fa-password"
						value={password}
						onChange={e => setPassword(e.target.value)}
						required
						autoComplete="current-password"
						disabled={submitting || busy}
					/>
				</div>
				<Button type="submit" disabled={submitting || busy || !password}>
					{submitting ? 'Generating…' : 'Enable two-factor auth'}
				</Button>
			</form>
		</div>
	)
}

function EnrollingView({
	enrollment,
	onVerifyEnrollment,
	onCancelEnrollment,
	busy,
}: TwoFactorPanelContentProps & { enrollment: EnrollmentPayload }) {
	const [code, setCode] = useState('')
	const [submitting, setSubmitting] = useState(false)
	const [secretShown, setSecretShown] = useState(false)
	const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

	const manualSecret = extractTotpSecret(enrollment.totpURI)

	// QR rendering is server-side so the qrcode library (which uses
	// `Function(...)`) never reaches the client bundle - lets us drop
	// `'unsafe-eval'` from the production CSP. See `src/api/totp-qr.ts`.
	useEffect(() => {
		let cancelled = false
		void getTotpQrSvg({ data: { totpURI: enrollment.totpURI } }).then(({ svg }) => {
			if (cancelled) return
			setQrDataUrl(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`)
		})
		return () => {
			cancelled = true
		}
	}, [enrollment.totpURI])

	const handle = async (e: React.FormEvent) => {
		e.preventDefault()
		if (code.length !== TOTP_CODE_LENGTH) return
		setSubmitting(true)
		try {
			await onVerifyEnrollment(code)
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<div className="space-y-3">
			<Alert>
				<AlertTitle>Step 1: scan with your authenticator app</AlertTitle>
				<AlertDescription>
					Open your authenticator and add a new account by scanning the QR code below. If you can't scan, enter the secret manually.
				</AlertDescription>
			</Alert>

			<div className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-start">
				<div className="flex size-[240px] shrink-0 items-center justify-center rounded bg-white">
					{qrDataUrl ? (
						<img src={qrDataUrl} alt="TOTP QR code" className="size-[240px]" />
					) : (
						<span className="text-xs text-muted-foreground">Generating QR…</span>
					)}
				</div>
				<div className="flex-1 space-y-2 text-sm">
					<div>
						<Label className="text-xs">Manual secret</Label>
						<div className="mt-1 flex items-center gap-2">
							<code className={cn('flex-1 rounded bg-muted px-2 py-1 font-mono text-xs break-all', !secretShown && 'blur-sm select-none')}>
								{manualSecret ?? 'unavailable'}
							</code>
							<Button
								type="button"
								size="icon-sm"
								variant="ghost"
								onClick={() => setSecretShown(s => !s)}
								title={secretShown ? 'Hide secret' : 'Show secret'}
							>
								{secretShown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
							</Button>
						</div>
					</div>
					<p className="text-xs text-muted-foreground">
						Account labeled <strong>GiftWrapt</strong>. The code rotates every 30 seconds.
					</p>
				</div>
			</div>

			<form onSubmit={handle} className="space-y-2">
				<div className="grid gap-2">
					<Label htmlFor="verify-totp-code">Step 2: enter the 6-digit code</Label>
					<Input
						id="verify-totp-code"
						value={code}
						onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, TOTP_CODE_LENGTH))}
						inputMode="numeric"
						autoComplete="one-time-code"
						placeholder="123456"
						maxLength={TOTP_CODE_LENGTH}
						required
						disabled={submitting || busy}
						className="font-mono tracking-[0.4em] text-base md:text-base"
					/>
				</div>
				<div className="flex gap-2">
					<Button type="submit" disabled={submitting || busy || code.length !== TOTP_CODE_LENGTH}>
						{submitting ? 'Verifying…' : 'Verify and turn on'}
					</Button>
					<Button type="button" variant="ghost" onClick={onCancelEnrollment} disabled={submitting || busy}>
						Cancel
					</Button>
				</div>
			</form>
		</div>
	)
}

function EnabledView({ onDisable, onRegenerateBackupCodes, busy }: TwoFactorPanelContentProps) {
	const [disablePassword, setDisablePassword] = useState('')
	const [regenPassword, setRegenPassword] = useState('')
	const [disabling, setDisabling] = useState(false)
	const [regenerating, setRegenerating] = useState(false)
	const [confirmDisable, setConfirmDisable] = useState(false)

	const handleDisable = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!confirmDisable) {
			setConfirmDisable(true)
			return
		}
		setDisabling(true)
		try {
			await onDisable(disablePassword)
			setConfirmDisable(false)
			setDisablePassword('')
		} finally {
			setDisabling(false)
		}
	}

	const handleRegen = async (e: React.FormEvent) => {
		e.preventDefault()
		setRegenerating(true)
		try {
			await onRegenerateBackupCodes(regenPassword)
			setRegenPassword('')
		} finally {
			setRegenerating(false)
		}
	}

	return (
		<div className="space-y-4">
			<Alert>
				<AlertTitle>Two-factor authentication is on</AlertTitle>
				<AlertDescription>You'll be asked for a code from your authenticator app every time you sign in.</AlertDescription>
			</Alert>

			<form onSubmit={handleRegen} className="space-y-2 rounded-md border p-3">
				<div className="space-y-1">
					<p className="text-sm font-medium">Regenerate backup codes</p>
					<p className="text-xs text-muted-foreground">Invalidates any existing codes. Stash the new ones somewhere safe.</p>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-end">
					<div className="grid gap-2 flex-1">
						<Label htmlFor="regen-2fa-password">Current password</Label>
						<PasswordInput
							id="regen-2fa-password"
							value={regenPassword}
							onChange={e => setRegenPassword(e.target.value)}
							required
							autoComplete="current-password"
							disabled={regenerating || busy}
						/>
					</div>
					<Button type="submit" variant="outline" disabled={regenerating || busy || !regenPassword}>
						{regenerating ? 'Generating…' : 'Regenerate codes'}
					</Button>
				</div>
			</form>

			<form onSubmit={handleDisable} className="space-y-2 rounded-md border border-destructive/30 p-3">
				<div className="space-y-1">
					<p className="text-sm font-medium text-destructive">Turn off two-factor auth</p>
					<p className="text-xs text-muted-foreground">Removes the TOTP requirement and clears all backup codes.</p>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-end">
					<div className="grid gap-2 flex-1">
						<Label htmlFor="disable-2fa-password">Current password</Label>
						<PasswordInput
							id="disable-2fa-password"
							value={disablePassword}
							onChange={e => setDisablePassword(e.target.value)}
							required
							autoComplete="current-password"
							disabled={disabling || busy}
						/>
					</div>
					<Button type="submit" variant="destructive" disabled={disabling || busy || !disablePassword}>
						{disabling ? 'Disabling…' : confirmDisable ? 'Confirm disable' : 'Disable'}
					</Button>
				</div>
				{confirmDisable && (
					<p className="text-xs text-muted-foreground">
						Click the button again to confirm. Your account will fall back to password-only sign-in.
					</p>
				)}
			</form>
		</div>
	)
}

function BackupCodesPanel({ codes, onDismiss }: { codes: Array<string>; onDismiss?: () => void }) {
	return (
		<Alert>
			<AlertTitle>Save your backup codes</AlertTitle>
			<AlertDescription>
				<p className="mb-2 text-xs">Each code is single-use. Use them if you lose access to your authenticator app.</p>
				<ul className="grid grid-cols-2 gap-1 font-mono text-xs sm:grid-cols-3">
					{codes.map(code => (
						<li key={code} className="rounded bg-muted px-2 py-1">
							{code}
						</li>
					))}
				</ul>
				{onDismiss && (
					<Button type="button" variant="ghost" size="sm" className="mt-2" onClick={onDismiss}>
						I've saved them
					</Button>
				)}
			</AlertDescription>
		</Alert>
	)
}

// Pulls the `secret=` query param from a TOTP URI of the form
// `otpauth://totp/Issuer:Account?secret=...&issuer=...`. Returned as
// hyphenated 4-char chunks so it's easier to type if the user
// can't scan the QR.
export function extractTotpSecret(uri: string): string | null {
	try {
		const u = new URL(uri)
		const secret = u.searchParams.get('secret')
		if (!secret) return null
		return chunkSecret(secret)
	} catch {
		return null
	}
}

function chunkSecret(raw: string): string {
	const cleaned = raw.replace(/\s+/g, '').toUpperCase()
	const out: Array<string> = []
	for (let i = 0; i < cleaned.length; i += 4) out.push(cleaned.slice(i, i + 4))
	return out.join(BACKUP_CODE_DELIMITER)
}
