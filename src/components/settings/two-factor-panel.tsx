import { Eye, EyeOff } from 'lucide-react'
import { useEffect, useState } from 'react'

import { RichMessage } from '@/components/common/rich-message'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { Switch } from '@/components/ui/switch'
import { errorText } from '@/lib/i18n/errors'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

// User-facing state for the 2FA section. Drives the panel's UI:
//
//   disabled  – not enrolled. CTA: "Enable two-factor auth".
//   enrolling – password collected, awaiting QR + verification code.
//   enabled   – done. Show status + "manage backup codes" / "disable" CTAs.
export type TwoFactorStatus = 'disabled' | 'enrolling' | 'enabled'

export type EnrollmentPayload = {
	totpURI: string
	backupCodes: Array<string>
	// Server-rendered QR SVG, fetched asynchronously by the parent after
	// enrollment starts. `null` while in flight (renders a "Generating QR…"
	// fallback). See `src/components/settings/two-factor-section.tsx` and
	// `src/api/totp-qr.ts`.
	qrSvg: string | null
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
	const isEnabled = status === 'enabled'
	const isEnrolling = status === 'enrolling'
	return (
		<div className="space-y-4">
			<TwoFactorHeader {...props} />

			{isEnrolling && enrollment && <EnrollingView {...props} enrollment={enrollment} />}
			{isEnabled && <EnabledExtras {...props} />}

			{pendingBackupCodes && pendingBackupCodes.length > 0 && (
				<BackupCodesPanel codes={pendingBackupCodes} onDismiss={props.onDismissBackupCodes} />
			)}

			{error && (
				<Alert variant="destructive">
					<AlertTitle>{m.settings_2fa_error_title()}</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{busy && <p className="text-xs text-muted-foreground">{m.settings_2fa_working()}</p>}
		</div>
	)
}

function TwoFactorHeader({ status, onStartEnrollment, onDisable, busy }: TwoFactorPanelContentProps) {
	const [enableDialogOpen, setEnableDialogOpen] = useState(false)
	const [disableDialogOpen, setDisableDialogOpen] = useState(false)
	const checked = status === 'enabled' || status === 'enrolling'
	const ariaLabel = checked ? m.settings_2fa_switch_disable_label() : m.settings_2fa_switch_enable_label()

	return (
		<>
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<h2 className="text-lg font-semibold">{m.settings_2fa_title()}</h2>
					<p className="text-sm text-muted-foreground">{m.settings_2fa_description()}</p>
				</div>
				<Switch
					checked={checked}
					onCheckedChange={() => {
						if (busy) return
						if (checked) setDisableDialogOpen(true)
						else setEnableDialogOpen(true)
					}}
					disabled={busy}
					aria-label={ariaLabel}
				/>
			</div>
			<PasswordPromptDialog
				open={enableDialogOpen}
				onOpenChange={setEnableDialogOpen}
				title={m.settings_2fa_enable_dialog_title()}
				description={m.settings_2fa_enable_dialog_description()}
				confirmLabel={m.action_continue()}
				confirmBusyLabel={m.settings_2fa_generating()}
				onConfirm={onStartEnrollment}
			/>
			<PasswordPromptDialog
				open={disableDialogOpen}
				onOpenChange={setDisableDialogOpen}
				title={m.settings_2fa_disable_dialog_title()}
				description={m.settings_2fa_disable_dialog_description()}
				confirmLabel={m.settings_2fa_disable_button()}
				confirmBusyLabel={m.settings_2fa_disabling()}
				destructive
				onConfirm={onDisable}
			/>
		</>
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

	const manualSecret = extractTotpSecret(enrollment.totpURI)
	const qrDataUrl = enrollment.qrSvg ? `data:image/svg+xml;utf8,${encodeURIComponent(enrollment.qrSvg)}` : null

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
				<AlertTitle>{m.settings_2fa_step1_title()}</AlertTitle>
				<AlertDescription>{m.settings_2fa_step1_description()}</AlertDescription>
			</Alert>

			<div className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-start">
				<div className="flex size-60 shrink-0 items-center justify-center rounded bg-white">
					{qrDataUrl ? (
						<img src={qrDataUrl} alt={m.settings_2fa_qr_alt()} className="size-60" />
					) : (
						<span className="text-xs text-muted-foreground">{m.settings_2fa_qr_generating()}</span>
					)}
				</div>
				<div className="flex-1 space-y-2 text-sm">
					<div>
						<Label className="text-xs">{m.settings_2fa_manual_secret_label()}</Label>
						<div className="mt-1 flex items-center gap-2">
							<code className={cn('flex-1 rounded bg-muted px-2 py-1 font-mono text-xs break-all', !secretShown && 'blur-sm select-none')}>
								{manualSecret ?? m.settings_2fa_manual_secret_unavailable()}
							</code>
							<Button
								type="button"
								size="icon-sm"
								variant="outline"
								onClick={() => setSecretShown(s => !s)}
								title={secretShown ? m.settings_2fa_hide_secret() : m.settings_2fa_show_secret()}
							>
								{secretShown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
							</Button>
						</div>
					</div>
					<p className="text-xs text-muted-foreground">
						<RichMessage parts={m.settings_2fa_account_hint.parts()} tags={{ strong: children => <strong>{children}</strong> }} />
					</p>
				</div>
			</div>

			<form onSubmit={handle} className="space-y-2">
				<div className="grid gap-2">
					<Label htmlFor="verify-totp-code">{m.settings_2fa_step2_label()}</Label>
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
						{submitting ? m.settings_2fa_verifying() : m.settings_2fa_verify_button()}
					</Button>
					<Button type="button" variant="outline" onClick={onCancelEnrollment} disabled={submitting || busy}>
						{m.action_cancel()}
					</Button>
				</div>
			</form>
		</div>
	)
}

function EnabledExtras({ onRegenerateBackupCodes, busy }: TwoFactorPanelContentProps) {
	const [regenPassword, setRegenPassword] = useState('')
	const [regenerating, setRegenerating] = useState(false)

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
				<AlertTitle>{m.settings_2fa_on_title()}</AlertTitle>
				<AlertDescription>{m.settings_2fa_on_description()}</AlertDescription>
			</Alert>

			<form onSubmit={handleRegen} className="space-y-2 rounded-md border p-3">
				<div className="space-y-1">
					<p className="text-sm font-medium">{m.settings_2fa_regenerate_title()}</p>
					<p className="text-xs text-muted-foreground">{m.settings_2fa_regenerate_description()}</p>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-end">
					<div className="grid gap-2 flex-1">
						<Label htmlFor="regen-2fa-password">{m.settings_password_current_label()}</Label>
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
						{regenerating ? m.settings_2fa_generating() : m.settings_2fa_regenerate_button()}
					</Button>
				</div>
			</form>
		</div>
	)
}

function PasswordPromptDialog({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel,
	confirmBusyLabel,
	destructive,
	onConfirm,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	title: string
	description: string
	confirmLabel: string
	confirmBusyLabel?: string
	destructive?: boolean
	// Returns once the server flow finishes. If it throws or the parent's
	// `error` prop becomes non-null after this resolves, the dialog stays
	// open so the user can retry; otherwise it closes.
	onConfirm: (password: string) => Promise<void> | void
}) {
	const [password, setPassword] = useState('')
	const [submitting, setSubmitting] = useState(false)
	const [localError, setLocalError] = useState<string | null>(null)

	useEffect(() => {
		if (!open) {
			setPassword('')
			setSubmitting(false)
			setLocalError(null)
		}
	}, [open])

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!password || submitting) return
		setSubmitting(true)
		setLocalError(null)
		try {
			await onConfirm(password)
			onOpenChange(false)
		} catch (err) {
			setLocalError(errorText(err, m.settings_2fa_prompt_error()))
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<form onSubmit={handleSubmit} className="space-y-4">
					<AlertDialogHeader>
						<AlertDialogTitle>{title}</AlertDialogTitle>
						<AlertDialogDescription>{description}</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="grid gap-2">
						<Label htmlFor="two-factor-prompt-password">{m.settings_password_current_label()}</Label>
						<PasswordInput
							id="two-factor-prompt-password"
							value={password}
							onChange={e => setPassword(e.target.value)}
							required
							autoComplete="current-password"
							disabled={submitting}
							autoFocus
						/>
					</div>
					{localError && (
						<Alert variant="destructive">
							<AlertDescription>{localError}</AlertDescription>
						</Alert>
					)}
					<AlertDialogFooter>
						<AlertDialogCancel disabled={submitting} type="button">
							{m.action_cancel()}
						</AlertDialogCancel>
						<Button type="submit" disabled={submitting || !password} variant={destructive ? 'destructive' : 'default'}>
							{submitting ? (confirmBusyLabel ?? m.settings_2fa_working()) : confirmLabel}
						</Button>
					</AlertDialogFooter>
				</form>
			</AlertDialogContent>
		</AlertDialog>
	)
}

function BackupCodesPanel({ codes, onDismiss }: { codes: Array<string>; onDismiss?: () => void }) {
	return (
		<Alert>
			<AlertTitle>{m.settings_2fa_backup_title()}</AlertTitle>
			<AlertDescription>
				<p className="mb-2 text-xs">{m.settings_2fa_backup_description()}</p>
				<ul className="grid grid-cols-2 gap-1 font-mono text-xs sm:grid-cols-3">
					{codes.map(code => (
						<li key={code} className="rounded bg-muted px-2 py-1">
							{code}
						</li>
					))}
				</ul>
				{onDismiss && (
					<Button type="button" variant="outline" size="xs" className="mt-2" onClick={onDismiss}>
						{m.settings_2fa_backup_dismiss()}
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
