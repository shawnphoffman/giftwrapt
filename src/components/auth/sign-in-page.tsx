import { Image } from '@unpic/react'
import { KeyRound } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { GradientBackground } from '@/components/ui/gradient-background'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import logo from '@/images/logo.webp'

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
// turned up). A label that does not follow the pattern is kept as is.
function shortSignInLabel(label: string): string {
	const match = /^Sign in with (.+)$/i.exec(label)
	return match ? `Use ${match[1]}` : label
}

const GENERIC_SIGN_IN_ERROR = 'Invalid email or password.'

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
			setError(GENERIC_SIGN_IN_ERROR)
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
			setError("Couldn't sign in with that passkey. Try again or use your password.")
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
			setError("Couldn't reach the OpenID provider. Try again or use your password.")
		} finally {
			setOidcLoading(false)
		}
	}

	return (
		<div className="relative flex items-center flex-col min-h-screen p-[10%] gap-4">
			<div className="absolute inset-0 -z-10 overflow-hidden">
				<GradientBackground />
			</div>
			<Image src={logo} alt="GiftWrapt" width={160} height={160} className="w-24 sm:w-40" />

			<div className="@container/card w-full max-w-md space-y-4 rounded-lg border bg-background/80 p-6 shadow-lg backdrop-blur">
				<div className="text-center">
					<h1 className="text-3xl font-bold">Sign in</h1>
					<p className="mt-2 text-muted-foreground">Enter your credentials to access your account</p>
				</div>

				<form onSubmit={handleSubmit} className="space-y-2">
					{error && <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">{error}</div>}

					<div className="space-y-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							type="text"
							inputMode="email"
							autoCapitalize="none"
							spellCheck={false}
							placeholder="you@example.com"
							value={email}
							onChange={e => setEmail(e.target.value)}
							required
							disabled={showLoading}
							autoComplete="email"
						/>
					</div>

					<div className="space-y-2">
						<div className="flex items-baseline justify-between gap-2">
							<Label htmlFor="password">Password</Label>
							{forgotPasswordHref && (
								<a href={forgotPasswordHref} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4">
									<SignInLabel long="Forgot password?" short="Forgot?" />
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
						{showLoading && !passkeyLoading ? 'Signing in...' : 'Sign in'}
					</Button>

					{(onSignInWithPasskey || onSignInWithOidc) && (
						<div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
							<div className="h-px flex-1 bg-border" />
							<span>or</span>
							<div className="h-px flex-1 bg-border" />
						</div>
					)}
					{onSignInWithPasskey && (
						<Button type="button" variant="outline" className="w-full" disabled={showLoading} onClick={handlePasskey}>
							<KeyRound className="size-4" />
							{passkeyLoading ? 'Authenticating…' : <SignInLabel long="Sign in with a passkey" short="Use a passkey" />}
						</Button>
					)}
					{onSignInWithOidc && (
						<Button type="button" variant="outline" className="w-full" disabled={showLoading} onClick={handleOidc}>
							{oidcLoading ? (
								'Redirecting…'
							) : (
								<SignInLabel
									long={oidcButtonText ?? 'Sign in with OpenID'}
									short={shortSignInLabel(oidcButtonText ?? 'Sign in with OpenID')}
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
