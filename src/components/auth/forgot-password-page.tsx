import { Image } from '@unpic/react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { GradientBackground } from '@/components/ui/gradient-background'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import logo from '@/images/logo.webp'

export type ForgotPasswordPageContentProps = {
	onSubmit: (email: string) => Promise<void>
	signInHref: string
	initialError?: string | null
	initialSubmitted?: boolean
	forceLoading?: boolean
	emailEnabled?: boolean
}

const GENERIC_SUBMIT_ERROR = 'Something went wrong. Please try again in a moment.'

export function ForgotPasswordPageContent({
	onSubmit,
	signInHref,
	initialError = null,
	initialSubmitted = false,
	forceLoading = false,
	emailEnabled = true,
}: ForgotPasswordPageContentProps) {
	const [email, setEmail] = useState('')
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(initialError)
	const [submitted, setSubmitted] = useState(initialSubmitted)

	const showLoading = isLoading || forceLoading

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		if (!emailEnabled) return
		setIsLoading(true)
		setError(null)
		try {
			await onSubmit(email)
			setSubmitted(true)
		} catch {
			setError(GENERIC_SUBMIT_ERROR)
		} finally {
			setIsLoading(false)
		}
	}

	return (
		<div className="relative flex flex-col items-center min-h-screen p-[10%] gap-4">
			<div className="absolute inset-0 -z-10 overflow-hidden">
				<GradientBackground />
			</div>
			<Image src={logo} alt="GiftWrapt" width={160} height={160} className="w-24 sm:w-40" />

			<div className="w-full max-w-md space-y-4 rounded-lg border bg-background/80 p-6 shadow-lg backdrop-blur">
				<div className="text-center">
					<h1 className="text-3xl font-bold">Reset your password</h1>
					<p className="mt-2 text-muted-foreground">
						{submitted
							? 'If an account exists for that address, we just sent a reset link to it.'
							: "Enter the email address on your account and we'll send you a link to reset your password."}
					</p>
				</div>

				{!emailEnabled && (
					<div className="p-3 text-sm text-muted-foreground bg-muted/40 border border-border rounded-md">
						Password reset emails are disabled on this server. Ask your administrator to recover your account.
					</div>
				)}

				{submitted ? (
					<div className="space-y-3">
						<div className="p-3 text-sm bg-muted/40 border border-border rounded-md">
							The link is good for 60 minutes. Check your spam folder if it doesn't arrive shortly.
						</div>
						<Button asChild variant="outline" className="w-full">
							<a href={signInHref}>Back to Sign In</a>
						</Button>
					</div>
				) : (
					<form onSubmit={handleSubmit} className="space-y-2">
						{error && <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">{error}</div>}

						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								placeholder="you@example.com"
								value={email}
								onChange={e => setEmail(e.target.value)}
								required
								disabled={showLoading || !emailEnabled}
								autoComplete="email"
							/>
						</div>

						<Button type="submit" className="w-full" disabled={showLoading || !emailEnabled}>
							{showLoading ? 'Sending…' : 'Send Reset Link'}
						</Button>

						<div className="pt-1 text-center text-sm">
							<a href={signInHref} className="text-muted-foreground hover:text-foreground underline underline-offset-4">
								Back to Sign In
							</a>
						</div>
					</form>
				)}
			</div>
		</div>
	)
}
