import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { updateUserPassword } from '@/api/user'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'

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

export default function PasswordForm() {
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [success, setSuccess] = useState(false)

	const form = useForm<PasswordFormValues>({
		resolver: zodResolver(PasswordSchema),
		defaultValues: {
			currentPassword: '',
			newPassword: '',
			confirmPassword: '',
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
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" id="update-password-form">
				<FormField
					control={form.control}
					name="currentPassword"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Current Password</FormLabel>
							<FormControl>
								<PasswordInput placeholder="••••••••" {...field} disabled={isLoading} autoComplete="current-password" />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="newPassword"
					render={({ field }) => (
						<FormItem>
							<FormLabel>New Password</FormLabel>
							<FormControl>
								<PasswordInput placeholder="••••••••" {...field} disabled={isLoading} autoComplete="new-password" />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="confirmPassword"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Confirm New Password</FormLabel>
							<FormControl>
								<PasswordInput placeholder="••••••••" {...field} disabled={isLoading} autoComplete="new-password" />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

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
					Update Password
				</Button>
			</form>
		</Form>
	)
}
