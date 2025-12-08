import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

import { createGuardianships, getUsersAsAdmin, updateUserPartner } from '@/api/admin'
import InputTooltip from '@/components/common/input-tooltip'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { birthMonthEnumValues, roleEnumValues } from '@/db/schema/enums'
import { UserSchema } from '@/db/schema/users'
import type { User } from '@/db-collections/users'
import { authClient } from '@/lib/auth-client'

import UserAvatar from '../common/user-avatar'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'

type CreateUserFormValues = z.infer<typeof UserSchema>

export function CreateUserForm() {
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [success, setSuccess] = useState(false)
	const queryClient = useQueryClient()

	const form = useForm<CreateUserFormValues>({
		resolver: zodResolver(UserSchema),
		defaultValues: {
			email: '',
			name: '',
			role: 'user',
			birthMonth: undefined,
			birthDay: undefined,
			guardianIds: [],
			partnerId: undefined,
		},
	})

	const watchedRole = form.watch('role')

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
				form.reset({
					email: '',
					name: '',
					role: 'user',
					birthMonth: undefined,
					birthDay: undefined,
					guardianIds: [],
					partnerId: undefined,
				})
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
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

				<div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
					<FormField
						control={form.control}
						name="birthMonth"
						render={({ field }) => (
							<FormItem className="w-full">
								<FormLabel>Birth Month</FormLabel>
								<Select onValueChange={value => field.onChange(value || undefined)} value={field.value || ''} disabled={isLoading}>
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
										{isLoadingUsers ? (
											<div className="text-sm text-muted-foreground">Loading users...</div>
										) : guardianOptions.length === 0 ? (
											<div className="text-sm text-muted-foreground">No users available</div>
										) : (
											guardianOptions.map(user => (
												<FormField
													key={user.id}
													control={form.control}
													name="guardianIds"
													render={({ field }) => {
														return (
															<FormItem key={user.id} className="flex flex-row items-center space-y-0">
																<FormControl>
																	<Checkbox
																		checked={field.value?.includes(user.id)}
																		onCheckedChange={checked => {
																			const currentValue = field.value || []
																			return checked
																				? field.onChange([...currentValue, user.id])
																				: field.onChange(currentValue.filter((id: string) => id !== user.id))
																		}}
																		disabled={isLoading}
																	/>
																</FormControl>
																<FormLabel className="font-normal cursor-pointer">
																	<UserAvatar name={user.name || user.email} image={user.image} className="size-5" />
																	{user.name || user.email}
																	{user.role === 'admin' && <span className="text-xs text-muted-foreground">(Admin)</span>}
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
										{partnerOptions.map(user => (
											<SelectItem key={user.id} value={user.id}>
												{user.name || user.email}
												{user.role === 'admin' && ' (Admin)'}
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
					// <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">{error}</div>
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
		</Form>
	)
}
