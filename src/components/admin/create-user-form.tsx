import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { z } from 'zod'

import { createGuardianships, getUsersAsAdmin, updateUserPartner } from '@/api/admin'
import { BirthDaySelect } from '@/components/common/birth-day-select'
import InputTooltip from '@/components/common/input-tooltip'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { birthMonthEnumValues, roleEnumValues } from '@/db/schema/enums'
import { UserSchema } from '@/db/schema/users'
import type { User } from '@/db-collections/users'
import { authClient } from '@/lib/auth-client'

import UserAvatar from '../common/user-avatar'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'

type CreateUserFormValues = z.infer<typeof UserSchema>

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

export function CreateUserForm() {
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [success, setSuccess] = useState(false)
	const queryClient = useQueryClient()

	const form = useForm({
		defaultValues: {
			email: '',
			name: '',
			role: 'user' as (typeof roleEnumValues)[number],
			birthMonth: undefined as (typeof birthMonthEnumValues)[number] | undefined,
			birthDay: undefined as number | undefined,
			guardianIds: [] as Array<string>,
			partnerId: undefined as string | undefined,
		},
		onSubmit: async ({ value }) => {
			// Validate with Zod before submitting
			const result = UserSchema.safeParse(value)
			if (!result.success) {
				setError(result.error.issues.map((e: { message: string }) => e.message).join(', '))
				return
			}
			await onSubmit(value as CreateUserFormValues)
		},
	})

	// Fetch users for guardian selection
	const { data: allUsers = [], isLoading: isLoadingUsers } = useQuery<Array<User>>({
		queryKey: ['admin', 'users'],
		queryFn: async () => {
			return await getUsersAsAdmin()
		},
	})

	// Filter out child users from guardian options (only users and admins can be guardians)
	const guardianOptions = allUsers.filter(user => user.role !== 'child')

	// Filter out child users from partner options (only users and admins can be partners)
	const partnerOptions = allUsers.filter(user => user.role !== 'child')

	const onSubmit = async (data: CreateUserFormValues) => {
		setIsLoading(true)
		setError(null)
		setSuccess(false)

		try {
			// Generate a temporary password - in production, you might want to send an invite email instead
			// const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12) + 'A1!'
			const tempPassword = 'password1'

			const result = await authClient.admin.createUser({
				email: data.email,
				password: tempPassword,
				name: data.name,
				data: {
					role: data.role,
					...(data.birthMonth && { birthMonth: data.birthMonth }),
					...(data.birthDay !== undefined && { birthDay: data.birthDay }),
					...(data.partnerId && { partnerId: data.partnerId }),
				},
			})

			if (result.error) {
				setError(result.error.message || 'Failed to create user')
			} else {
				const userId = result.data.user.id

				// If role is 'child' and guardians are selected, create guardianships
				if (data.role === 'child' && userId && data.guardianIds && data.guardianIds.length > 0) {
					try {
						await createGuardianships({
							data: {
								childUserId: userId,
								parentUserIds: data.guardianIds,
							},
						} as Parameters<typeof createGuardianships>[0])
					} catch (guardianError) {
						console.error('Failed to create guardianships:', guardianError)
						setError('User created but failed to assign guardians. Please update manually.')
						setIsLoading(false)
						return
					}
				}

				// If a partner is selected, update the partner's record to reference this user
				if (data.partnerId && userId) {
					try {
						await updateUserPartner({
							data: {
								userId: data.partnerId,
								partnerId: userId,
							},
						} as Parameters<typeof updateUserPartner>[0])
					} catch (partnerError) {
						console.error('Failed to update partner record:', partnerError)
						setError('User created but failed to update partner record. Please update manually.')
						setIsLoading(false)
						return
					}
				}

				setSuccess(true)
				form.reset()
				// Invalidate and refetch the users query to update the impersonation dropdown
				queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
				// Clear success message after 5 seconds
				setTimeout(() => setSuccess(false), 5000)
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create user')
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
		>
			<form.Field name="email">
				{field => (
					<div className="grid gap-2">
						<Label htmlFor={field.name}>Email</Label>
						<Input
							id={field.name}
							type="email"
							placeholder="user@example.com"
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

			<form.Field name="name">
				{field => (
					<div className="grid gap-2">
						<Label htmlFor={field.name}>Name</Label>
						<Input
							id={field.name}
							type="text"
							placeholder="John Doe"
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

			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
							<form.Subscribe selector={state => state.values.birthMonth}>
								{month => (
									<BirthDaySelect
										id={field.name}
										month={month}
										value={field.state.value}
										onValueChange={day => field.handleChange(day)}
										disabled={isLoading}
									/>
								)}
							</form.Subscribe>
							{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
								<p className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</p>
							)}
						</div>
					)}
				</form.Field>

				<form.Field name="role">
					{field => (
						<div className="grid gap-2 w-full">
							<Label htmlFor={field.name}>
								Role
								<InputTooltip>
									<span className="font-semibold underline">Child</span> users are allowed to make their own lists but they cannot
									participate in purchasing or view other users' lists.
								</InputTooltip>
							</Label>
							<Select
								onValueChange={value => field.handleChange(value as (typeof roleEnumValues)[number])}
								value={field.state.value}
								disabled={isLoading}
							>
								<SelectTrigger id={field.name} className="w-full">
									<SelectValue placeholder="Select role" />
								</SelectTrigger>
								<SelectContent>
									{roleEnumValues.map(role => (
										<SelectItem key={role} value={role}>
											{role.charAt(0).toUpperCase() + role.slice(1)}
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
			</div>

			<form.Subscribe selector={state => state.values.role}>
				{role =>
					role === 'child' && (
						<form.Field name="guardianIds">
							{field => (
								<div className="grid gap-2">
									<Label>
										Guardians
										<InputTooltip>
											Guardians are responsible for a child user. They can edit the child user's lists as well as impersonate them.
										</InputTooltip>
									</Label>
									<div className="border rounded-md p-4 max-h-60 overflow-y-auto space-y-2">
										{isLoadingUsers ? (
											<div className="text-sm text-muted-foreground">Loading users...</div>
										) : guardianOptions.length === 0 ? (
											<div className="text-sm text-muted-foreground">No users available</div>
										) : (
											guardianOptions.map(guardianUser => {
												const currentValue = field.state.value
												const isChecked = currentValue.includes(guardianUser.id)
												return (
													<div key={guardianUser.id} className="flex flex-row items-center space-y-0 gap-2">
														<Checkbox
															id={`guardian-${guardianUser.id}`}
															checked={isChecked}
															onCheckedChange={checked => {
																if (checked) {
																	field.handleChange([...currentValue, guardianUser.id])
																} else {
																	field.handleChange(currentValue.filter(id => id !== guardianUser.id))
																}
															}}
															disabled={isLoading}
														/>
														<Label htmlFor={`guardian-${guardianUser.id}`} className="font-normal cursor-pointer">
															<UserAvatar name={guardianUser.name || guardianUser.email} image={guardianUser.image} size="small" />
															{guardianUser.name || guardianUser.email}
															{guardianUser.role === 'admin' && <span className="text-xs text-muted-foreground"> (Admin)</span>}
														</Label>
													</div>
												)
											})
										)}
									</div>
									{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
										<p className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</p>
									)}
								</div>
							)}
						</form.Field>
					)
				}
			</form.Subscribe>

			<form.Subscribe selector={state => state.values.role}>
				{role =>
					(role === 'user' || role === 'admin') && (
						<form.Field name="partnerId">
							{field => (
								<div className="grid gap-2">
									<Label htmlFor={field.name}>Partner</Label>
									<Select
										onValueChange={value => {
											field.handleChange(value === '__none__' ? undefined : value)
										}}
										value={field.state.value || '__none__'}
										disabled={isLoading}
									>
										<SelectTrigger id={field.name} className="w-full">
											<SelectValue placeholder="Select partner (optional)" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="__none__">None</SelectItem>
											{partnerOptions.map(partnerUser => (
												<SelectItem key={partnerUser.id} value={partnerUser.id}>
													{partnerUser.name || partnerUser.email}
													{partnerUser.role === 'admin' && ' (Admin)'}
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
					)
				}
			</form.Subscribe>

			{error && (
				<Alert variant="destructive">
					<AlertTitle>Error</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			{success && (
				<Alert variant="default">
					<AlertTitle>Success</AlertTitle>
					<AlertDescription>User created successfully!</AlertDescription>
				</Alert>
			)}

			<Button type="submit" disabled={isLoading} className="w-full" variant="default">
				{isLoading ? 'Creating user...' : 'Create User'}
			</Button>
		</form>
	)
}
