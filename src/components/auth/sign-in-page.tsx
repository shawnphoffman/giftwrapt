import { Image } from '@unpic/react'
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
}

const GENERIC_SIGN_IN_ERROR = 'Invalid email or password.'

export function SignInPageContent({ onSubmit, initialError = null, forceLoading = false, forgotPasswordHref }: SignInPageContentProps) {
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(initialError)

	const showLoading = isLoading || forceLoading

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

	return (
		<div className="relative flex items-center flex-col min-h-screen p-[10%] gap-4">
			<div className="absolute inset-0 -z-10 overflow-hidden">
				<GradientBackground />
			</div>
			<Image src={logo} alt="GiftWrapt" width={160} height={160} className="w-24 sm:w-40" />

			<div className="w-full max-w-md space-y-4 rounded-lg border bg-background/80 p-6 shadow-lg backdrop-blur">
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
							type="email"
							placeholder="you@example.com"
							value={email}
							onChange={e => setEmail(e.target.value)}
							required
							disabled={showLoading}
							autoComplete="email"
						/>
					</div>

					<div className="space-y-2">
						<div className="flex items-baseline justify-between">
							<Label htmlFor="password">Password</Label>
							{forgotPasswordHref && (
								<a href={forgotPasswordHref} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4">
									Forgot password?
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
						{showLoading ? 'Signing in...' : 'Sign in'}
					</Button>
				</form>
			</div>
		</div>
	)
}
