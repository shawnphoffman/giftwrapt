import { useForm } from '@tanstack/react-form'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { updateUserPassword } from '@/api/user'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

import { PasswordInput } from '../ui/password-input'

const PasswordSchema = z
	.object({
		currentPassword: z.string().min(1, 'Current password is required'),
		newPassword: z.string().min(8, 'Password must be at least 8 characters'),
		confirmPassword: z.string().min(1, 'Please confirm your password'),
	})
	.refine(data => data.newPassword === data.confirmPassword, {
		message: "Passwords don't match",
		path: ['confirmPassword'],
	})

type PasswordFormValues = z.infer<typeof PasswordSchema>

// Helper to extract error messages from TanStack Form errors (which can be objects or strings)
function getErrorMessage(errors: Array<unknown>): string {
	return errors
		.map(err => {
			if (typeof err === 'string') return err
			if (err && typeof err === 'object' && 'message' in err) return (err as { message: string }).message
			return String(err)
		})
		.join(', ')
}

export default function PasswordForm() {
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [success, setSuccess] = useState(false)

	const form = useForm({
		defaultValues: {
			currentPassword: '',
			newPassword: '',
			confirmPassword: '',
		},
		onSubmit: async ({ value }) => {
			// Validate with Zod before submitting
			const result = PasswordSchema.safeParse(value)
			if (!result.success) {
				setError(result.error.issues.map((e: { message: string }) => e.message).join(', '))
				return
			}
			await onSubmit(value as PasswordFormValues)
		},
	})

	const onSubmit = async (data: PasswordFormValues) => {
		setIsLoading(true)
		setError(null)
		setSuccess(false)

		try {
			await updateUserPassword({
				data: {
					currentPassword: data.currentPassword,
					newPassword: data.newPassword,
				},
			})

			setSuccess(true)
			toast.success('Password updated successfully')
			form.reset()
			// Clear success message after 5 seconds
			setTimeout(() => setSuccess(false), 5000)
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to update password'
			setError(errorMessage)
			toast.error(errorMessage)
		} finally {
			setIsLoading(false)
		}
	}

	return (
		<form
			onSubmit={e => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit()
			}}
			className="space-y-4"
			id="update-password-form"
		>
			<form.Field name="currentPassword">
				{field => (
					<div className="grid gap-2">
						<Label htmlFor={field.name}>Current Password</Label>
						<PasswordInput
							id={field.name}
							placeholder="••••••••"
							value={field.state.value}
							onChange={e => field.handleChange(e.target.value)}
							onBlur={field.handleBlur}
							disabled={isLoading}
							autoComplete="current-password"
						/>
						{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
							<p className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</p>
						)}
					</div>
				)}
			</form.Field>

			<form.Field name="newPassword">
				{field => (
					<div className="grid gap-2">
						<Label htmlFor={field.name}>New Password</Label>
						<PasswordInput
							id={field.name}
							placeholder="••••••••"
							value={field.state.value}
							onChange={e => field.handleChange(e.target.value)}
							onBlur={field.handleBlur}
							disabled={isLoading}
							autoComplete="new-password"
						/>
						{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
							<p className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</p>
						)}
					</div>
				)}
			</form.Field>

			<form.Field name="confirmPassword">
				{field => (
					<div className="grid gap-2">
						<Label htmlFor={field.name}>Confirm New Password</Label>
						<PasswordInput
							id={field.name}
							placeholder="••••••••"
							value={field.state.value}
							onChange={e => field.handleChange(e.target.value)}
							onBlur={field.handleBlur}
							disabled={isLoading}
							autoComplete="new-password"
						/>
						{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
							<p className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</p>
						)}
					</div>
				)}
			</form.Field>

			{error && (
				<Alert variant="destructive">
					<AlertTitle>Error</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			{success && (
				<Alert variant="default">
					<AlertTitle>Success</AlertTitle>
					<AlertDescription>Password updated successfully!</AlertDescription>
				</Alert>
			)}
			<Button type="submit" disabled={isLoading}>
				{isLoading ? 'Updating...' : 'Update'}
			</Button>
		</form>
	)
}
