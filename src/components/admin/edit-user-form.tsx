import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

import { getGuardianshipsForChild, getUsersAsAdmin, updateGuardianships, updateUserAsAdmin, updateUserPartner } from '@/api/admin'
import InputTooltip from '@/components/common/input-tooltip'
import UserAvatar from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { birthMonthEnumValues, roleEnumValues } from '@/db/schema/enums'
import { UserSchema } from '@/db/schema/users'
import type { User } from '@/db-collections/users'

import { Alert, AlertDescription, AlertTitle } from '../ui/alert'

type EditUserFormValues = z.infer<typeof UserSchema>

const userDetailsQueryOptions = (userId: string) => ({
	queryKey: ['admin', 'user', userId],
	queryFn: async () => {
		const { getUserDetailsAsAdmin } = await import('@/api/admin')
		return await getUserDetailsAsAdmin({ data: { userId } })
	},
})

export function EditUserForm({ userId }: { userId: string }) {
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [success, setSuccess] = useState(false)
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

	const form = useForm<EditUserFormValues>({
		resolver: zodResolver(UserSchema),
		defaultValues: {
			email: '',
			name: '',
			role: 'user',
			birthMonth: undefined,
			birthDay: undefined,
			guardianIds: [],
			partnerId: undefined,
			image: undefined,
		},
	})

	const initializedUserId = useRef<string | null>(null)
	const previousGuardianIds = useRef<Array<string>>([])

	// Populate form when user data loads
	useEffect(() => {
		if (user && initializedUserId.current !== user.id) {
			const formValues: EditUserFormValues = {
				email: user.email || '',
				name: user.name || '',
				role: user.role,
				birthMonth: user.birthMonth ?? undefined,
				birthDay: user.birthDay ?? undefined,
				guardianIds: existingGuardianIds,
				partnerId: user.partnerId ?? undefined,
				image: user.image ?? undefined,
			}
			// Reset form with all values
			form.reset(formValues, { keepDefaultValues: false })
			initializedUserId.current = user.id
			previousGuardianIds.current = existingGuardianIds
		}
	}, [user?.id, form, existingGuardianIds])

	// Update guardianships when they change (but only after initial load)
	useEffect(() => {
		if (
			initializedUserId.current === userId &&
			user?.role === 'child' &&
			!isLoadingGuardianships &&
			JSON.stringify(previousGuardianIds.current) !== JSON.stringify(existingGuardianIds)
		) {
			form.setValue('guardianIds', existingGuardianIds)
			previousGuardianIds.current = existingGuardianIds
		}
	}, [existingGuardianIds, isLoadingGuardianships, userId, user?.role, form])

	const watchedRole = form.watch('role')
	const watchedImage = form.watch('image')
	const watchedName = form.watch('name')

	// Get the image to display in preview - use watchedImage if it's a non-empty string, otherwise null
	const previewImage = watchedImage?.trim() ? watchedImage : null

	// Filter out child users from guardian options (only users and admins can be guardians)
	const guardianOptions = allUsers.filter(u => u.role !== 'child' && u.id !== userId)

	// Filter out child users and current user from partner options
	const partnerOptions = allUsers.filter(u => u.role !== 'child' && u.id !== userId)

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
			const oldPartnerId = user?.partnerId || null

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
		<Form {...form} key={user.id}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
				{/* Avatar Preview */}
				<div className="flex items-center gap-4 pb-4 border-b">
					<UserAvatar name={watchedName || user.name || user.email || ''} image={previewImage} className="size-16 rounded-full" />
					<div className="flex-1">
						<p className="text-sm font-medium">Avatar Preview</p>
						<p className="text-xs text-muted-foreground">Preview updates as you type</p>
					</div>
				</div>

				<FormField
					control={form.control}
					name="email"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Email</FormLabel>
							<FormControl>
								<Input type="email" placeholder="user@example.com" {...field} disabled={isLoading} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="name"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Name</FormLabel>
							<FormControl>
								<Input type="text" placeholder="John Doe" {...field} disabled={isLoading} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="image"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Image URL</FormLabel>
							<FormControl>
								<Input
									type="url"
									placeholder="https://example.com/avatar.jpg"
									value={field.value ?? ''}
									onChange={e => {
										const value = e.target.value
										// Convert empty string to null immediately
										field.onChange(value.trim() === '' ? null : value.trim())
									}}
									onBlur={field.onBlur}
									disabled={isLoading}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
					<FormField
						control={form.control}
						name="birthMonth"
						render={({ field }) => (
							<FormItem className="w-full">
								<FormLabel>Birth Month</FormLabel>
								<Select
									onValueChange={value => {
										field.onChange(value === '' ? undefined : value)
									}}
									value={field.value ?? ''}
									disabled={isLoading}
								>
									<FormControl>
										<SelectTrigger className="w-full text-base">
											<SelectValue placeholder="Select month" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{birthMonthEnumValues.map(month => (
											<SelectItem key={month} value={month}>
												{month.charAt(0).toUpperCase() + month.slice(1)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="birthDay"
						render={({ field }) => (
							<FormItem className="w-full">
								<FormLabel>Birth Day</FormLabel>
								<FormControl>
									<Input
										type="number"
										placeholder="Day (1-31)"
										min={1}
										max={31}
										className="w-full"
										onChange={e => {
											const value = e.target.value
											if (value === '') {
												field.onChange(undefined)
											} else {
												const num = parseInt(value, 10)
												if (!isNaN(num)) {
													field.onChange(num)
												}
											}
										}}
										onBlur={field.onBlur}
										value={field.value ?? ''}
										name={field.name}
										disabled={isLoading}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="role"
						render={({ field }) => (
							<FormItem className="w-full">
								<FormLabel>
									Role
									<InputTooltip>
										<span className="font-semibold underline">Child</span> users are allowed to make their own lists but they cannot
										participate in purchasing or view other users' lists.
									</InputTooltip>
								</FormLabel>
								<Select onValueChange={field.onChange} value={field.value} disabled={isLoading}>
									<FormControl>
										<SelectTrigger className="w-full text-base">
											<SelectValue placeholder="Select role" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{roleEnumValues.map(role => (
											<SelectItem key={role} value={role}>
												{role.charAt(0).toUpperCase() + role.slice(1)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>

				{watchedRole === 'child' && (
					<FormField
						control={form.control}
						name="guardianIds"
						render={() => (
							<FormItem>
								<FormLabel>
									Guardians
									<InputTooltip>
										Guardians are responsible for a child user. They can edit the child user's lists as well as impersonate them.
									</InputTooltip>
								</FormLabel>
								<FormControl>
									<div className="border rounded-md p-4 max-h-60 overflow-y-auto space-y-2">
										{isLoadingUsers || isLoadingGuardianships ? (
											<div className="text-sm text-muted-foreground">Loading users...</div>
										) : guardianOptions.length === 0 ? (
											<div className="text-sm text-muted-foreground">No users available</div>
										) : (
											guardianOptions.map(guardianUser => (
												<FormField
													key={guardianUser.id}
													control={form.control}
													name="guardianIds"
													render={({ field }) => {
														return (
															<FormItem key={guardianUser.id} className="flex flex-row items-center space-x-3 space-y-0">
																<FormControl>
																	<Checkbox
																		checked={field.value?.includes(guardianUser.id)}
																		onCheckedChange={checked => {
																			const currentValue = field.value || []
																			return checked
																				? field.onChange([...currentValue, guardianUser.id])
																				: field.onChange(currentValue.filter((id: string) => id !== guardianUser.id))
																		}}
																		disabled={isLoading}
																	/>
																</FormControl>
																<FormLabel className="font-normal cursor-pointer flex items-center gap-2">
																	<UserAvatar
																		name={guardianUser.name || guardianUser.email}
																		image={guardianUser.image}
																		className="size-5"
																	/>
																	<span>
																		{guardianUser.name || guardianUser.email}
																		{guardianUser.role === 'admin' && <span className="text-xs text-muted-foreground"> (Admin)</span>}
																	</span>
																</FormLabel>
															</FormItem>
														)
													}}
												/>
											))
										)}
									</div>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				)}

				{(watchedRole === 'user' || watchedRole === 'admin') && (
					<FormField
						control={form.control}
						name="partnerId"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Partner</FormLabel>
								<Select
									onValueChange={value => {
										field.onChange(value === '__none__' ? undefined : value)
									}}
									value={field.value || '__none__'}
									disabled={isLoading}
								>
									<FormControl>
										<SelectTrigger className="w-full text-base">
											<SelectValue placeholder="Select partner (optional)" />
										</SelectTrigger>
									</FormControl>
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
								<FormMessage />
							</FormItem>
						)}
					/>
				)}

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
		</Form>
	)
}
