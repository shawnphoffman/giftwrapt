import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import type { z } from 'zod'

import { getPotentialPartners, updateUserProfile } from '@/api/user'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { birthMonthEnumValues } from '@/db/schema/enums'
import { UserSchema } from '@/db/schema/users'
import { useSession } from '@/lib/auth-client'

import UserAvatar from '../common/user-avatar'

type UpdateProfileFormValues = z.infer<typeof UserSchema>

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

type ProfileFormProps = {
	name: string
	birthMonth?: string | null
	birthDay?: number | null
	partnerId?: string | null
}

export default function ProfileForm({ name, birthMonth, birthDay, partnerId }: ProfileFormProps) {
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [success, setSuccess] = useState(false)
	const queryClient = useQueryClient()
	const { refetch: refetchSession } = useSession()

	// Fetch potential partners
	const { data: potentialPartners = [], isLoading: isLoadingPartners } = useQuery({
		queryKey: ['potentialPartners'],
		queryFn: async () => {
			return await getPotentialPartners()
		},
	})

	const form = useForm({
		defaultValues: {
			name: name || '',
			birthMonth: birthMonth ?? undefined,
			birthDay: birthDay ?? undefined,
			partnerId: partnerId ?? undefined,
		},
		onSubmit: async ({ value }) => {
			// Validate with Zod before submitting (only the fields we're using)
			const result = UserSchema.pick({ name: true, birthMonth: true, birthDay: true, partnerId: true }).safeParse(value)
			if (!result.success) {
				setError(result.error.issues.map((e: { message: string }) => e.message).join(', '))
				return
			}
			await onSubmit(value as UpdateProfileFormValues)
		},
	})

	const onSubmit = async (data: UpdateProfileFormValues) => {
		setIsLoading(true)
		setError(null)
		setSuccess(false)

		try {
			const updateData: {
				name: string
				birthMonth?: string | null
				birthDay?: number | null
				partnerId?: string | null
			} = {
				name: data.name,
				// Always send partnerId since it's part of the form (undefined/null means clear partner)
				partnerId: data.partnerId || null,
			}
			if (data.birthMonth !== undefined) {
				updateData.birthMonth = data.birthMonth
			}
			if (data.birthDay !== undefined) {
				updateData.birthDay = data.birthDay
			}
			await updateUserProfile({
				data: updateData,
			})

			setSuccess(true)
			toast.success('Profile updated successfully')
			// Refetch session to update user data across all components using useSession
			await refetchSession()
			// Invalidate potential partners in case partner relationships changed
			queryClient.invalidateQueries({ queryKey: ['potentialPartners'] })
			// Clear success message after 5 seconds
			setTimeout(() => setSuccess(false), 5000)
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to update profile'
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
			className="flex-1 space-y-4"
			id="update-profile-form"
		>
			<form.Field name="name">
				{field => (
					<div className="grid gap-2">
						<Label htmlFor={field.name}>Name</Label>
						<Input
							id={field.name}
							type="text"
							placeholder="Ezekiel"
							value={field.state.value}
							onChange={e => field.handleChange(e.target.value)}
							onBlur={field.handleBlur}
							disabled={isLoading}
						/>
						{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
							<p className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</p>
						)}
					</div>
				)}
			</form.Field>

			<div className="grid grid-cols-2 gap-4">
				<form.Field name="birthMonth">
					{field => (
						<div className="grid gap-2 w-full">
							<Label htmlFor={field.name}>Birth Month</Label>
							<Select
								onValueChange={value => {
									field.handleChange(value === '' ? undefined : (value as (typeof birthMonthEnumValues)[number]))
								}}
								value={field.state.value ?? ''}
								disabled={isLoading}
							>
								<SelectTrigger id={field.name} className="w-full">
									<SelectValue placeholder="Select month" />
								</SelectTrigger>
								<SelectContent>
									{birthMonthEnumValues.map(month => (
										<SelectItem key={month} value={month}>
											{month.charAt(0).toUpperCase() + month.slice(1)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
								<p className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</p>
							)}
						</div>
					)}
				</form.Field>

				<form.Field name="birthDay">
					{field => (
						<div className="grid gap-2 w-full">
							<Label htmlFor={field.name}>Birth Day</Label>
							<Input
								id={field.name}
								type="text"
								placeholder="Day (1-31)"
								className="w-full"
								onChange={e => {
									const value = e.target.value
									if (value === '') {
										field.handleChange(undefined)
									} else {
										const num = parseInt(value, 10)
										if (!isNaN(num)) {
											// Clamp value between 1 and 31
											const clamped = Math.min(Math.max(num, 1), 31)
											field.handleChange(clamped)
										}
									}
								}}
								onBlur={field.handleBlur}
								value={field.state.value ?? ''}
								disabled={isLoading}
							/>
							{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
								<p className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</p>
							)}
						</div>
					)}
				</form.Field>
			</div>

			<form.Field name="partnerId">
				{field => (
					<div className="grid gap-2">
						<Label htmlFor={field.name}>Partner</Label>
						<Select
							onValueChange={value => {
								field.handleChange(value === '__none__' ? undefined : value)
							}}
							value={field.state.value || '__none__'}
							disabled={isLoading || isLoadingPartners}
						>
							<SelectTrigger id={field.name} className="w-full">
								<SelectValue placeholder="Select partner (optional)" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="__none__">None</SelectItem>
								{potentialPartners.map(partnerUser => (
									<SelectItem key={partnerUser.id} value={partnerUser.id}>
										<span className="flex items-center gap-2">
											<UserAvatar name={partnerUser.name || partnerUser.email} image={partnerUser.image} size="small" />
											{partnerUser.name || partnerUser.email}
											{partnerUser.role === 'admin' && <span className="text-xs text-muted-foreground">(Admin)</span>}
										</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
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
					<AlertDescription>Profile updated successfully!</AlertDescription>
				</Alert>
			)}
			<Button type="submit" disabled={isLoading}>
				{isLoading ? 'Saving...' : 'Save'}
			</Button>
		</form>
	)
}
