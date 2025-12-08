import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { z } from 'zod'

import { getGuardianshipsForChild, getUsersAsAdmin, updateGuardianships, updateUserAsAdmin, updateUserPartner } from '@/api/admin'
import InputTooltip from '@/components/common/input-tooltip'
import UserAvatar from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { birthMonthEnumValues, roleEnumValues } from '@/db/schema/enums'
import { type User as DbUser, UserSchema } from '@/db/schema/users'
import type { User } from '@/db-collections/users'

import { Alert, AlertDescription, AlertTitle } from '../ui/alert'

type EditUserFormValues = z.infer<typeof UserSchema>

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

const userDetailsQueryOptions = (userId: string) => ({
	queryKey: ['admin', 'user', userId],
	queryFn: async () => {
		const { getUserDetailsAsAdmin } = await import('@/api/admin')
		return await getUserDetailsAsAdmin({ data: { userId } })
	},
})

export function EditUserForm({ userId }: { userId: string }) {
	const queryClient = useQueryClient()

	// Fetch user details
	const { data: user, isLoading: isLoadingUser, error: userError } = useQuery(userDetailsQueryOptions(userId))

	// Fetch guardianships if user is a child
	const { data: existingGuardianIds = [], isLoading: isLoadingGuardianships } = useQuery({
		queryKey: ['admin', 'guardianships', userId],
		queryFn: async () => {
			if (user?.role === 'child') {
				return await getGuardianshipsForChild({ data: { childUserId: userId } })
			}
			return []
		},
		enabled: !!user && user.role === 'child',
	})

	// Fetch users for guardian/partner selection
	const { data: allUsers = [], isLoading: isLoadingUsers } = useQuery<Array<User>>({
		queryKey: ['admin', 'users'],
		queryFn: async () => {
			return await getUsersAsAdmin()
		},
	})

	// Filter out child users from guardian options (only users and admins can be guardians)
	const guardianOptions = allUsers.filter(u => u.role !== 'child' && u.id !== userId)

	// Filter out child users and current user from partner options
	const partnerOptions = allUsers.filter(u => u.role !== 'child' && u.id !== userId)

	if (isLoadingUser) {
		return <div className="text-sm text-muted-foreground">Loading user...</div>
	}

	if (userError) {
		return (
			<div className="text-sm text-destructive">Error loading user: {userError instanceof Error ? userError.message : 'Unknown error'}</div>
		)
	}

	if (!user) {
		return <div className="text-sm text-muted-foreground">User not found</div>
	}

	return (
		<EditUserFormInner
			key={user.id}
			user={user}
			userId={userId}
			existingGuardianIds={existingGuardianIds}
			isLoadingGuardianships={isLoadingGuardianships}
			isLoadingUsers={isLoadingUsers}
			guardianOptions={guardianOptions}
			partnerOptions={partnerOptions}
			queryClient={queryClient}
		/>
	)
}

function EditUserFormInner({
	user,
	userId,
	existingGuardianIds,
	isLoadingGuardianships,
	isLoadingUsers,
	guardianOptions,
	partnerOptions,
	queryClient,
}: {
	user: DbUser
	userId: string
	existingGuardianIds: Array<string>
	isLoadingGuardianships: boolean
	isLoadingUsers: boolean
	guardianOptions: Array<User>
	partnerOptions: Array<User>
	queryClient: ReturnType<typeof useQueryClient>
}) {
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [success, setSuccess] = useState(false)

	const form = useForm({
		defaultValues: {
			email: user.email || '',
			name: user.name || '',
			role: user.role,
			birthMonth: user.birthMonth ?? undefined,
			birthDay: user.birthDay ?? undefined,
			guardianIds: existingGuardianIds,
			partnerId: user.partnerId ?? undefined,
			image: user.image ?? undefined,
		},
		onSubmit: async ({ value }) => {
			// Validate with Zod before submitting
			const result = UserSchema.safeParse(value)
			if (!result.success) {
				setError(result.error.issues.map((e: { message: string }) => e.message).join(', '))
				return
			}
			await onSubmit(value as EditUserFormValues)
		},
	})

	const previousGuardianIds = useRef<Array<string>>(existingGuardianIds)

	// Update guardianships when they change
	useEffect(() => {
		if (
			user.role === 'child' &&
			!isLoadingGuardianships &&
			JSON.stringify(previousGuardianIds.current) !== JSON.stringify(existingGuardianIds)
		) {
			form.setFieldValue('guardianIds', existingGuardianIds)
			previousGuardianIds.current = existingGuardianIds
		}
	}, [existingGuardianIds, isLoadingGuardianships, user.role, form])

	const onSubmit = async (data: EditUserFormValues) => {
		setIsLoading(true)
		setError(null)
		setSuccess(false)

		try {
			// Normalize partnerId (handle __none__ case)
			const normalizedPartnerId = data.partnerId === '__none__' ? null : data.partnerId || null

			// Update user basic info
			await updateUserAsAdmin({
				data: {
					userId,
					email: data.email,
					name: data.name,
					role: data.role,
					birthMonth: data.birthMonth || null,
					birthDay: data.birthDay || null,
					image: data.image === '' ? null : data.image || null,
					partnerId: normalizedPartnerId,
				},
			} as Parameters<typeof updateUserAsAdmin>[0])

			// Handle guardianships for child users
			if (data.role === 'child') {
				try {
					await updateGuardianships({
						data: {
							childUserId: userId,
							parentUserIds: data.guardianIds || [],
						},
					} as Parameters<typeof updateGuardianships>[0])
				} catch (guardianError) {
					console.error('Failed to update guardianships:', guardianError)
					setError('User updated but failed to update guardianships. Please update manually.')
					setIsLoading(false)
					return
				}
			}

			// Handle partner relationship
			const newPartnerId = normalizedPartnerId
			const oldPartnerId = user.partnerId || null

			// If partner changed, update both users
			if (newPartnerId !== oldPartnerId) {
				// Remove old partner relationship if it existed
				if (oldPartnerId) {
					try {
						await updateUserPartner({
							data: {
								userId: oldPartnerId,
								partnerId: null,
							},
						} as Parameters<typeof updateUserPartner>[0])
					} catch (partnerError) {
						console.error('Failed to remove old partner relationship:', partnerError)
					}
				}

				// Set new partner relationship
				if (newPartnerId) {
					try {
						await updateUserPartner({
							data: {
								userId: newPartnerId,
								partnerId: userId,
							},
						} as Parameters<typeof updateUserPartner>[0])
					} catch (partnerError) {
						console.error('Failed to update partner relationship:', partnerError)
						setError('User updated but failed to update partner relationship. Please update manually.')
						setIsLoading(false)
						return
					}
				}
			}

			setSuccess(true)
			// Invalidate queries to refresh data
			queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] })
			queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
			queryClient.invalidateQueries({ queryKey: ['admin', 'guardianships', userId] })
			// Clear success message after 5 seconds
			setTimeout(() => setSuccess(false), 5000)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to update user')
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
			{/* Avatar Preview */}
			<form.Subscribe selector={state => ({ name: state.values.name, image: state.values.image })}>
				{({ name, image }) => {
					const previewImage = image?.trim() ? image : null
					return (
						<div className="flex items-center gap-4 pb-4 border-b">
							<UserAvatar name={name || user.name || user.email || ''} image={previewImage} size="large" />
							<div className="flex-1">
								<p className="text-sm font-medium">Avatar Preview</p>
								<p className="text-xs text-muted-foreground">Preview updates as you type</p>
							</div>
						</div>
					)
				}}
			</form.Subscribe>

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

			<form.Field name="image">
				{field => (
					<div className="grid gap-2">
						<Label htmlFor={field.name}>Image URL</Label>
						<Input
							id={field.name}
							type="url"
							placeholder="https://example.com/avatar.jpg"
							value={field.state.value ?? ''}
							onChange={e => {
								const value = e.target.value
								// Convert empty string to null immediately
								field.handleChange(value.trim() === '' ? undefined : value.trim())
							}}
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
								type="number"
								placeholder="Day (1-31)"
								min={1}
								max={31}
								className="w-full"
								onChange={e => {
									const value = e.target.value
									if (value === '') {
										field.handleChange(undefined)
									} else {
										const num = parseInt(value, 10)
										if (!isNaN(num)) {
											field.handleChange(num)
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

			<form.Field name="role">
				{field => (
					<div className="grid gap-2 w-full">
						<Label htmlFor={field.name}>
							Role
							<InputTooltip>
								<span className="font-semibold underline">Child</span> users are allowed to make their own lists but they cannot participate
								in purchasing or view other users' lists.
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
										{isLoadingUsers || isLoadingGuardianships ? (
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
					<AlertDescription>User updated successfully!</AlertDescription>
				</Alert>
			)}

			<Button type="submit" disabled={isLoading} className="w-full" variant="default">
				{isLoading ? 'Updating user...' : 'Update User'}
			</Button>
		</form>
	)
}
