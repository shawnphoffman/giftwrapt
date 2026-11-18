import { Image } from '@unpic/react'
import { KeyRound } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { GradientBackground } from '@/components/ui/gradient-background'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import logo from '@/images/logo.webp'
import { m } from '@/paraglide/messages.js'

// The product name is never translated.
const PRODUCT_NAME = 'GiftWrapt'

export type SignInPageContentProps = {
	onSubmit: (email: string, password: string) => Promise<void>
	initialError?: string | null
	forceLoading?: boolean
	forgotPasswordHref?: string
	// Optional secondary path: "Sign in with a passkey". Pass an
	// async handler in to enable the button. We deliberately keep this
	// as an *option*, never a default. Passkey is add-on only.
	onSignInWithPasskey?: () => Promise<void>
	// Optional tertiary path: "Sign in with OpenID". Configured via
	// the admin form at /admin/auth; surfaced here as a button when
	// the deployment has a wired-up provider.
	onSignInWithOidc?: () => Promise<void>
	oidcButtonText?: string
}

// "Sign in with X" as "Use X", for the narrow card (a phone with the text size
// turned up). The label is text an admin typed, so the pattern is matched in
// English; a label that does not follow it is kept as is.
function shortSignInLabel(label: string): string {
	const match = /^Sign in with (.+)$/i.exec(label)
	return match ? m.auth_sign_in_use_provider({ provider: match[1] }) : label
}

export function SignInPageContent({
	onSubmit,
	initialError = null,
	forceLoading = false,
	forgotPasswordHref,
	onSignInWithPasskey,
	onSignInWithOidc,
	oidcButtonText,
}: SignInPageContentProps) {
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [isLoading, setIsLoading] = useState(false)
	const [passkeyLoading, setPasskeyLoading] = useState(false)
	const [oidcLoading, setOidcLoading] = useState(false)
	const [error, setError] = useState<string | null>(initialError)

	const showLoading = isLoading || forceLoading || passkeyLoading || oidcLoading

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		setIsLoading(true)
		setError(null)
		try {
			await onSubmit(email, password)
		} catch {
			// One message for every failure, so the page never reveals whether
			// an account exists.
			setError(m.auth_sign_in_error())
		} finally {
			setIsLoading(false)
		}
	}

	const handlePasskey = async () => {
		if (!onSignInWithPasskey) return
		setPasskeyLoading(true)
		setError(null)
		try {
			await onSignInWithPasskey()
		} catch {
			setError(m.auth_sign_in_passkey_error())
		} finally {
			setPasskeyLoading(false)
		}
	}

	const handleOidc = async () => {
		if (!onSignInWithOidc) return
		setOidcLoading(true)
		setError(null)
		try {
			await onSignInWithOidc()
		} catch {
			setError(m.auth_sign_in_oidc_error())
		} finally {
			setOidcLoading(false)
		}
	}

	return (
		<div className="relative flex items-center flex-col min-h-screen p-[10%] gap-4">
			<div className="absolute inset-0 -z-10 overflow-hidden">
				<GradientBackground />
			</div>
			<Image src={logo} alt={PRODUCT_NAME} width={160} height={160} className="w-24 sm:w-40" />

			<div className="@container/card w-full max-w-md space-y-4 rounded-lg border bg-background/80 p-6 shadow-lg backdrop-blur">
				<div className="text-center">
					<h1 className="text-3xl font-bold">{m.page_sign_in()}</h1>
					<p className="mt-2 text-muted-foreground">{m.auth_sign_in_subtitle()}</p>
				</div>

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
							disabled={showLoading}
							autoComplete="email"
						/>
					</div>

					<div className="space-y-2">
						<div className="flex items-baseline justify-between gap-2">
							<Label htmlFor="password">{m.auth_password_label()}</Label>
							{forgotPasswordHref && (
								<a href={forgotPasswordHref} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4">
									<SignInLabel long={m.auth_sign_in_forgot_link()} short={m.auth_sign_in_forgot_link_short()} />
								</a>
							)}
						</div>
						<PasswordInput
							id="password"
							placeholder="••••••••"
							value={password}
							onChange={e => setPassword(e.target.value)}
							required
							disabled={showLoading}
							autoComplete="current-password"
						/>
					</div>

					<Button type="submit" className="w-full" disabled={showLoading}>
						{showLoading && !passkeyLoading ? m.auth_sign_in_submitting() : m.auth_sign_in_button()}
					</Button>

					{(onSignInWithPasskey || onSignInWithOidc) && (
						<div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
							<div className="h-px flex-1 bg-border" />
							<span>{m.auth_sign_in_or()}</span>
							<div className="h-px flex-1 bg-border" />
						</div>
					)}
					{onSignInWithPasskey && (
						<Button type="button" variant="outline" className="w-full" disabled={showLoading} onClick={handlePasskey}>
							<KeyRound className="size-4" />
							{passkeyLoading ? (
								m.auth_passkey_authenticating()
							) : (
								<SignInLabel long={m.auth_sign_in_passkey_button()} short={m.auth_sign_in_passkey_button_short()} />
							)}
						</Button>
					)}
					{onSignInWithOidc && (
						<Button type="button" variant="outline" className="w-full" disabled={showLoading} onClick={handleOidc}>
							{oidcLoading ? (
								m.auth_sign_in_redirecting()
							) : (
								<SignInLabel
									long={oidcButtonText ?? m.auth_sign_in_oidc_button()}
									short={oidcButtonText != null ? shortSignInLabel(oidcButtonText) : m.auth_sign_in_oidc_button_short()}
								/>
							)}
						</Button>
					)}
				</form>
			</div>
		</div>
	)
}

// The short label replaces the long one only when the card is narrower than the
// long labels need (10.5rem, so it follows the text size).
function SignInLabel({ long, short }: { long: string; short: string }) {
	if (long === short) return <>{long}</>
	return (
		<>
			<span className="@max-[10.5rem]/card:hidden">{long}</span>
			<span className="hidden @max-[10.5rem]/card:inline">{short}</span>
		</>
	)
}
