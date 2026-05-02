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

const TOTP_LENGTH = 6
const GENERIC_ERROR = "That code didn't work. Try again."

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

	const submit = async () => {
		if (showLoading) return
		setError(null)
		setSubmitting(true)
		try {
			if (mode === 'totp') {
				await onSubmitTotp(code, trustDevice)
			} else {
				await onSubmitBackupCode(code)
			}
		} catch {
			setError(GENERIC_ERROR)
		} finally {
			setSubmitting(false)
		}
	}

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		await submit()
	}

	const handleTotpChange = (next: string) => {
		setCode(next)
		if (next.length === TOTP_LENGTH) {
			void submit()
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
			<Image src={logo} alt="GiftWrapt" width={160} height={160} className="w-24 sm:w-40" />

			<div className="w-full max-w-md space-y-4 rounded-lg border bg-background/80 p-6 shadow-lg backdrop-blur">
				<div className="text-center">
					<h1 className="text-3xl font-bold">Two-factor authentication</h1>
					<p className="mt-2 text-muted-foreground">
						{mode === 'totp'
							? 'Enter the 6-digit code from your authenticator app to finish signing in.'
							: 'Enter one of the backup codes you saved when you set up 2FA.'}
					</p>
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
							containerClassName="justify-center my-6"
						>
							<InputOTPGroup>
								<InputOTPSlot index={0} className="size-12 text-lg" />
								<InputOTPSlot index={1} className="size-12 text-lg" />
							</InputOTPGroup>
							<InputOTPSeparator />
							<InputOTPGroup>
								<InputOTPSlot index={2} className="size-12 text-lg" />
								<InputOTPSlot index={3} className="size-12 text-lg" />
							</InputOTPGroup>
							<InputOTPSeparator />
							<InputOTPGroup>
								<InputOTPSlot index={4} className="size-12 text-lg" />
								<InputOTPSlot index={5} className="size-12 text-lg" />
							</InputOTPGroup>
						</InputOTP>
					) : (
						<div className="space-y-2">
							<Label htmlFor="2fa-code">Backup code</Label>
							<Input
								id="2fa-code"
								value={code}
								onChange={e => setCode(e.target.value.toUpperCase().slice(0, 64))}
								inputMode="text"
								autoComplete="one-time-code"
								placeholder="XXXX-XXXX"
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
								Trust this device for 60 days
							</Label>
						</div>
					)}

					<Button type="submit" className="w-full" disabled={showLoading || code.length === 0}>
						{showLoading ? 'Verifying…' : 'Verify'}
					</Button>

					<div className="flex items-center justify-between pt-1 text-xs">
						{mode === 'totp' ? (
							<button
								type="button"
								onClick={() => switchMode('backup')}
								className="text-muted-foreground hover:text-foreground underline underline-offset-4"
							>
								Use a backup code instead
							</button>
						) : (
							<button
								type="button"
								onClick={() => switchMode('totp')}
								className="text-muted-foreground hover:text-foreground underline underline-offset-4"
							>
								Use authenticator code
							</button>
						)}
						<a href={signInHref} className="text-muted-foreground hover:text-foreground underline underline-offset-4">
							Cancel sign-in
						</a>
					</div>
				</form>
			</div>
		</div>
	)
}
