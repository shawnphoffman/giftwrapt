import { Image } from '@unpic/react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { GradientBackground } from '@/components/ui/gradient-background'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import logo from '@/images/logo.webp'
import { m } from '@/paraglide/messages.js'

// The product name is never translated.
const PRODUCT_NAME = 'GiftWrapt'

export type ResetPasswordPageContentProps = {
	onSubmit: (newPassword: string) => Promise<void>
	signInHref: string
	tokenPresent: boolean
	initialError?: string | null
	initialSubmitted?: boolean
	forceLoading?: boolean
}

const MIN_PASSWORD_LENGTH = 8

export function ResetPasswordPageContent({
	onSubmit,
	signInHref,
	tokenPresent,
	initialError = null,
	initialSubmitted = false,
	forceLoading = false,
}: ResetPasswordPageContentProps) {
	const [password, setPassword] = useState('')
	const [confirm, setConfirm] = useState('')
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(initialError)
	const [submitted, setSubmitted] = useState(initialSubmitted)

	const showLoading = isLoading || forceLoading

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		if (!tokenPresent) return
		if (password.length < MIN_PASSWORD_LENGTH) {
			setError(m.auth_reset_password_too_short({ min: MIN_PASSWORD_LENGTH }))
			return
		}
		if (password !== confirm) {
			setError(m.auth_reset_password_mismatch())
			return
		}
		setIsLoading(true)
		setError(null)
		try {
			await onSubmit(password)
			setSubmitted(true)
		} catch {
			setError(m.auth_reset_error())
		} finally {
			setIsLoading(false)
		}
	}

	return (
		<div className="relative flex flex-col items-center min-h-screen p-[10%] gap-4">
			<div className="absolute inset-0 -z-10 overflow-hidden">
				<GradientBackground />
			</div>
			<Image src={logo} alt={PRODUCT_NAME} width={160} height={160} className="w-24 sm:w-40" />

			<div className="w-full max-w-md space-y-4 rounded-lg border bg-background/80 p-6 shadow-lg backdrop-blur">
				<div className="text-center">
					<h1 className="text-3xl font-bold">{m.auth_reset_title()}</h1>
					<p className="mt-2 text-muted-foreground">{submitted ? m.auth_reset_done_subtitle() : m.auth_reset_subtitle()}</p>
				</div>

				{!tokenPresent && (
					<div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
						{m.auth_reset_missing_token()}
					</div>
				)}

				{submitted ? (
					<Button asChild className="w-full">
						<a href={signInHref}>{m.auth_reset_continue_link()}</a>
					</Button>
				) : (
					<form onSubmit={handleSubmit} className="space-y-2">
						{error && <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">{error}</div>}

						<div className="space-y-2">
							<Label htmlFor="new-password">{m.auth_reset_new_password_label()}</Label>
							<PasswordInput
								id="new-password"
								placeholder="••••••••"
								value={password}
								onChange={e => setPassword(e.target.value)}
								required
								minLength={MIN_PASSWORD_LENGTH}
								disabled={showLoading || !tokenPresent}
								autoComplete="new-password"
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="confirm-password">{m.auth_reset_confirm_password_label()}</Label>
							<PasswordInput
								id="confirm-password"
								placeholder="••••••••"
								value={confirm}
								onChange={e => setConfirm(e.target.value)}
								required
								minLength={MIN_PASSWORD_LENGTH}
								disabled={showLoading || !tokenPresent}
								autoComplete="new-password"
							/>
						</div>

						<Button type="submit" className="w-full" disabled={showLoading || !tokenPresent}>
							{showLoading ? m.state_saving() : m.auth_reset_submit()}
						</Button>
					</form>
				)}
			</div>
		</div>
	)
}
