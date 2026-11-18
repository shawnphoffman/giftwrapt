import { Image } from '@unpic/react'
import { REGEXP_ONLY_DIGITS } from 'input-otp'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { GradientBackground } from '@/components/ui/gradient-background'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp'
import { Label } from '@/components/ui/label'
import logo from '@/images/logo.webp'
import { m } from '@/paraglide/messages.js'

// The product name is never translated.
const PRODUCT_NAME = 'GiftWrapt'
// The shape of a backup code, not text.
const BACKUP_CODE_PLACEHOLDER = 'xxxxx-xxxxx'

const TOTP_LENGTH = 6
// The code always fits inside the card. In one row it needs 20rem (six 3rem
// boxes and two separators), or 17rem with 2.5rem boxes; below that it becomes
// two rows of three separate boxes, which is what phones get. The queries are in
// rem, so they also follow the text size.
const OTP_CONTAINER =
	'justify-center my-6 @max-[17rem]/card:mx-auto @max-[17rem]/card:grid @max-[17rem]/card:w-fit @max-[17rem]/card:grid-cols-3 @max-[17rem]/card:gap-2 @max-[17rem]/card:[&_[data-slot=input-otp-group]]:contents @max-[17rem]/card:[&_[data-slot=input-otp-separator]]:hidden'
const OTP_SLOT =
	'size-12 text-lg @max-[20rem]/card:size-10 @max-[20rem]/card:text-base @max-[17rem]/card:rounded-md @max-[17rem]/card:border'

export type TwoFactorMode = 'totp' | 'backup'

export type TwoFactorChallengePageContentProps = {
	mode: TwoFactorMode
	onModeChange: (mode: TwoFactorMode) => void
	onSubmitTotp: (code: string, trustDevice: boolean) => Promise<void>
	onSubmitBackupCode: (code: string) => Promise<void>
	signInHref: string
	initialError?: string | null
	forceLoading?: boolean
}

export function TwoFactorChallengePageContent({
	mode,
	onModeChange,
	onSubmitTotp,
	onSubmitBackupCode,
	signInHref,
	initialError = null,
	forceLoading = false,
}: TwoFactorChallengePageContentProps) {
	const [code, setCode] = useState('')
	const [trustDevice, setTrustDevice] = useState(false)
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(initialError)

	const showLoading = submitting || forceLoading

	// Takes the value to send instead of reading `code` from state: the
	// auto-submit below runs in the same tick as `setCode`, when the state
	// still holds the previous value (five digits while typing, or nothing
	// after a paste or a password-manager fill).
	const submit = async (value: string) => {
		if (showLoading) return
		setError(null)
		setSubmitting(true)
		try {
			if (mode === 'totp') {
				await onSubmitTotp(value, trustDevice)
			} else {
				await onSubmitBackupCode(value.trim())
			}
		} catch {
			setError(m.auth_2fa_error())
		} finally {
			setSubmitting(false)
		}
	}

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		await submit(code)
	}

	const handleTotpChange = (next: string) => {
		setCode(next)
		if (next.length === TOTP_LENGTH) {
			void submit(next)
		}
	}

	const switchMode = (next: TwoFactorMode) => {
		onModeChange(next)
		setCode('')
		setError(null)
	}

	return (
		<div className="relative flex flex-col items-center min-h-screen p-[10%] gap-4">
			<div className="absolute inset-0 -z-10 overflow-hidden">
				<GradientBackground />
			</div>
			<Image src={logo} alt={PRODUCT_NAME} width={160} height={160} className="w-24 sm:w-40" />

			<div className="@container/card w-full max-w-md space-y-4 rounded-lg border bg-background/80 p-6 shadow-lg backdrop-blur">
				<div className="text-center">
					<h1 className="text-3xl font-bold @max-[12.5rem]/card:text-2xl @max-[10.5rem]/card:text-xl">{m.auth_2fa_title()}</h1>
					<p className="mt-2 text-muted-foreground">{mode === 'totp' ? m.auth_2fa_totp_subtitle() : m.auth_2fa_backup_subtitle()}</p>
				</div>

				<form onSubmit={handleSubmit} className="space-y-3">
					{error && <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">{error}</div>}

					{mode === 'totp' ? (
						<InputOTP
							id="2fa-code"
							maxLength={TOTP_LENGTH}
							value={code}
							onChange={handleTotpChange}
							pattern={REGEXP_ONLY_DIGITS}
							inputMode="numeric"
							autoComplete="one-time-code"
							disabled={showLoading}
							autoFocus
							containerClassName={OTP_CONTAINER}
						>
							<InputOTPGroup>
								<InputOTPSlot index={0} className={OTP_SLOT} />
								<InputOTPSlot index={1} className={OTP_SLOT} />
							</InputOTPGroup>
							<InputOTPSeparator />
							<InputOTPGroup>
								<InputOTPSlot index={2} className={OTP_SLOT} />
								<InputOTPSlot index={3} className={OTP_SLOT} />
							</InputOTPGroup>
							<InputOTPSeparator />
							<InputOTPGroup>
								<InputOTPSlot index={4} className={OTP_SLOT} />
								<InputOTPSlot index={5} className={OTP_SLOT} />
							</InputOTPGroup>
						</InputOTP>
					) : (
						<div className="space-y-2">
							<Label htmlFor="2fa-code">{m.auth_2fa_backup_label()}</Label>
							<Input
								id="2fa-code"
								value={code}
								// Backup codes are case-sensitive (mixed-case letters and
								// digits), so the value is kept exactly as entered.
								onChange={e => setCode(e.target.value.slice(0, 64))}
								autoCapitalize="none"
								autoCorrect="off"
								spellCheck={false}
								inputMode="text"
								autoComplete="one-time-code"
								placeholder={BACKUP_CODE_PLACEHOLDER}
								required
								disabled={showLoading}
								autoFocus
								className="font-mono tracking-[0.3em] text-base md:text-base"
							/>
						</div>
					)}

					{mode === 'totp' && (
						<div className="flex items-center gap-2">
							<Checkbox id="trust-device" checked={trustDevice} onCheckedChange={v => setTrustDevice(v === true)} disabled={showLoading} />
							<Label htmlFor="trust-device" className="font-normal text-sm">
								{m.auth_2fa_trust_device()}
							</Label>
						</div>
					)}

					<Button type="submit" className="w-full" disabled={showLoading || code.length === 0}>
						{showLoading ? m.auth_2fa_verifying() : m.auth_2fa_verify()}
					</Button>

					<div className="flex items-center justify-between pt-1 text-xs">
						{mode === 'totp' ? (
							<button
								type="button"
								onClick={() => switchMode('backup')}
								className="text-muted-foreground hover:text-foreground underline underline-offset-4"
							>
								{m.auth_2fa_use_backup()}
							</button>
						) : (
							<button
								type="button"
								onClick={() => switchMode('totp')}
								className="text-muted-foreground hover:text-foreground underline underline-offset-4"
							>
								{m.auth_2fa_use_totp()}
							</button>
						)}
						<a href={signInHref} className="text-muted-foreground hover:text-foreground underline underline-offset-4">
							{m.auth_2fa_cancel()}
						</a>
					</div>
				</form>
			</div>
		</div>
	)
}
