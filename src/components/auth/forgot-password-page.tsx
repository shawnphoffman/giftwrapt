import { Image } from '@unpic/react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { GradientBackground } from '@/components/ui/gradient-background'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import logo from '@/images/logo.webp'
import { m } from '@/paraglide/messages.js'

// The product name is never translated.
const PRODUCT_NAME = 'GiftWrapt'

export type ForgotPasswordPageContentProps = {
	onSubmit: (email: string) => Promise<void>
	signInHref: string
	initialError?: string | null
	initialSubmitted?: boolean
	forceLoading?: boolean
	emailEnabled?: boolean
}

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
			setError(m.auth_forgot_error())
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
					<h1 className="text-3xl font-bold">{m.auth_forgot_title()}</h1>
					<p className="mt-2 text-muted-foreground">{submitted ? m.auth_forgot_sent_subtitle() : m.auth_forgot_subtitle()}</p>
				</div>

				{!emailEnabled && (
					<div className="p-3 text-sm text-muted-foreground bg-muted/40 border border-border rounded-md">
						{m.auth_forgot_email_disabled()}
					</div>
				)}

				{submitted ? (
					<div className="space-y-3">
						<div className="p-3 text-sm bg-muted/40 border border-border rounded-md">{m.auth_forgot_sent_hint()}</div>
						<Button asChild variant="outline" className="w-full">
							<a href={signInHref}>{m.auth_back_to_sign_in()}</a>
						</Button>
					</div>
				) : (
					<form onSubmit={handleSubmit} className="space-y-2">
						{error && <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">{error}</div>}

						<div className="space-y-2">
							<Label htmlFor="email">{m.auth_email_label()}</Label>
							<Input
								id="email"
								type="text"
								inputMode="email"
								autoCapitalize="none"
								spellCheck={false}
								placeholder={m.auth_email_placeholder()}
								value={email}
								onChange={e => setEmail(e.target.value)}
								required
								disabled={showLoading || !emailEnabled}
								autoComplete="email"
							/>
						</div>

						<Button type="submit" className="w-full" disabled={showLoading || !emailEnabled}>
							{showLoading ? m.auth_forgot_sending() : m.auth_forgot_submit()}
						</Button>

						<div className="pt-1 text-center text-sm">
							<a href={signInHref} className="text-muted-foreground hover:text-foreground underline underline-offset-4">
								{m.auth_back_to_sign_in()}
							</a>
						</div>
					</form>
				)}
			</div>
		</div>
	)
}
