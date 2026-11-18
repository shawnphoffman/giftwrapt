import { useForm } from '@tanstack/react-form'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { updateUserPassword } from '@/api/user'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { errorText, UserFacingError } from '@/lib/i18n/errors'
import { zodIssuesText, zodParams } from '@/lib/i18n/zod'
import { LIMITS } from '@/lib/validation/limits'
import { m } from '@/paraglide/messages.js'

import { PasswordInput } from '../ui/password-input'

// Built on each call, not once at module level: the messages have to be in
// the language of the page that is rendering.
function passwordSchema() {
	return z
		.object({
			currentPassword: z.string().min(1, m.settings_password_current_required()).max(LIMITS.PASSWORD),
			newPassword: z
				.string()
				.min(8, m.settings_password_too_short())
				.max(LIMITS.PASSWORD, m.settings_password_too_long({ max: LIMITS.PASSWORD })),
			confirmPassword: z.string().min(1, m.settings_password_confirm_required()).max(LIMITS.PASSWORD),
		})
		.refine(data => data.newPassword === data.confirmPassword, {
			message: m.settings_password_mismatch(),
			path: ['confirmPassword'],
		})
}

type PasswordFormValues = z.infer<ReturnType<typeof passwordSchema>>

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
			const result = passwordSchema().safeParse(value, zodParams())
			if (!result.success) {
				setError(zodIssuesText(result.error))
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
			const result = await updateUserPassword({
				data: {
					currentPassword: data.currentPassword,
					newPassword: data.newPassword,
				},
			})
			if (!result.success) throw new UserFacingError(m.auth_error_invalid_password())

			setSuccess(true)
			toast.success(m.settings_password_updated_toast())
			form.reset()
			// Clear success message after 5 seconds
			setTimeout(() => setSuccess(false), 5000)
		} catch (err) {
			const errorMessage = errorText(err, m.settings_password_update_failed())
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
						<Label htmlFor={field.name}>{m.settings_password_current_label()}</Label>
						<PasswordInput
							id={field.name}
							placeholder="••••••••"
							value={field.state.value}
							onChange={e => field.handleChange(e.target.value)}
							onBlur={field.handleBlur}
							disabled={isLoading}
							maxLength={LIMITS.PASSWORD}
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
						<Label htmlFor={field.name}>{m.settings_password_new_label()}</Label>
						<PasswordInput
							id={field.name}
							placeholder="••••••••"
							value={field.state.value}
							onChange={e => field.handleChange(e.target.value)}
							onBlur={field.handleBlur}
							disabled={isLoading}
							maxLength={LIMITS.PASSWORD}
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
						<Label htmlFor={field.name}>{m.settings_password_confirm_label()}</Label>
						<PasswordInput
							id={field.name}
							placeholder="••••••••"
							value={field.state.value}
							onChange={e => field.handleChange(e.target.value)}
							onBlur={field.handleBlur}
							disabled={isLoading}
							maxLength={LIMITS.PASSWORD}
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
					<AlertTitle>{m.settings_alert_error_title()}</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			{success && (
				<Alert variant="default">
					<AlertTitle>{m.settings_alert_success_title()}</AlertTitle>
					<AlertDescription>{m.settings_password_updated_alert()}</AlertDescription>
				</Alert>
			)}
			<Button type="submit" disabled={isLoading}>
				{isLoading ? m.settings_password_updating() : m.action_update()}
			</Button>
		</form>
	)
}
