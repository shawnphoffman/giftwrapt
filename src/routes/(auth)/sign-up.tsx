import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Image } from '@unpic/react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import logo from '@/images/logo.png'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/(auth)/sign-up')({
	component: SignUp,
})

function SignUp() {
	const navigate = useNavigate()
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [name, setName] = useState('')
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		setIsLoading(true)
		setError(null)

		const { error: signUpError } = await authClient.signUp.email(
			{
				email,
				password,
				name,
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
					setError(ctx.error.message || 'Failed to sign up')
				},
			}
		)

		if (signUpError) {
			setError(signUpError.message || 'Failed to sign up')
			setIsLoading(false)
		}
	}

	return (
		<div className="flex items-center flex-col min-h-screen p-[10%] gap-4 bg-background">
			<Image src={logo} alt="Wish Lists" width={160} height={160} className="w-24 sm:w-40" />

			<div className="w-full max-w-md space-y-4">
				<div className="text-center">
					<h1 className="text-3xl font-bold">Create an account</h1>
					<p className="mt-2 text-muted-foreground">Enter your information to get started</p>
				</div>

				<form onSubmit={handleSubmit} className="space-y-2">
					{error && <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">{error}</div>}

					<div className="space-y-2">
						<Label htmlFor="name">Name</Label>
						<Input
							id="name"
							type="text"
							placeholder="John Doe"
							value={name}
							onChange={e => setName(e.target.value)}
							required
							disabled={isLoading}
							autoComplete="name"
						/>
					</div>

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
							minLength={8}
							disabled={isLoading}
							autoComplete="new-password"
						/>
						<p className="text-xs text-muted-foreground">Must be at least 8 characters</p>
					</div>

					<Button type="submit" className="w-full" disabled={isLoading}>
						{isLoading ? 'Creating account...' : 'Sign up'}
					</Button>
				</form>

				<div className="text-center text-sm">
					<span className="text-muted-foreground">Already have an account? </span>
					<button type="button" onClick={() => navigate({ to: '/sign-in' as any })} className="text-primary hover:underline font-medium">
						Sign in
					</button>
				</div>
			</div>
		</div>
	)
}
