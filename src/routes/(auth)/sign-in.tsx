import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Image } from '@unpic/react'
import { useEffect, useState } from 'react'

import Loading from '@/components/loading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import logo from '@/images/logo.png'
import { authClient, useSession } from '@/lib/auth-client'

export const Route = createFileRoute('/(auth)/sign-in')({
	component: SignIn,
})

function SignIn() {
	const navigate = useNavigate()
	const { data: session, isPending } = useSession()
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// Redirect to home if already authenticated
	useEffect(() => {
		if (!isPending && session?.user) {
			navigate({ to: '/' })
		}
	}, [session, isPending, navigate])

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		setIsLoading(true)
		setError(null)

		const { error: signInError } = await authClient.signIn.email(
			{
				email,
				password,
			},
			{
				onRequest: () => {
					setIsLoading(true)
				},
				onSuccess: () => {
					setIsLoading(false)
					navigate({ to: '/' })
				},
				onError: ctx => {
					setIsLoading(false)
					setError(ctx.error.message || 'Failed to sign in')
				},
			}
		)

		if (signInError) {
			setError(signInError.message || 'Failed to sign in')
			setIsLoading(false)
		}
	}

	if (isPending) {
		return (
			<div className="flex items-center justify-center w-full h-screen">
				<Loading />
			</div>
		)
	}

	// Don't render form if already authenticated (redirect will happen)
	if (session?.user) {
		return null
	}

	return (
		<div className="flex items-center flex-col min-h-screen p-[10%] gap-4 bg-background">
			<Image src={logo} alt="Wish Lists" width={160} height={160} className="w-24 sm:w-40" />

			<div className="w-full max-w-md space-y-4">
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
							disabled={isLoading}
							autoComplete="email"
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="password">Password</Label>
						<PasswordInput
							id="password"
							placeholder="••••••••"
							value={password}
							onChange={e => setPassword(e.target.value)}
							required
							disabled={isLoading}
							autoComplete="current-password"
						/>
					</div>

					<Button type="submit" className="w-full" disabled={isLoading}>
						{isLoading ? 'Signing in...' : 'Sign in'}
					</Button>
				</form>

				{/* <div className="text-center text-sm">
					<span className="text-muted-foreground">Don't have an account? </span>
					<button type="button" onClick={() => navigate({ to: '/sign-up' as any })} className="text-primary hover:underline font-medium">
						Sign up
					</button>
				</div> */}
			</div>
		</div>
	)
}
