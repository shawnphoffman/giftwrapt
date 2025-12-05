import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { birthMonthEnumValues } from '@/db/schema/enums'
import { UserSchema } from '@/db/schema/users'
import { authClient } from '@/lib/auth-client'

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
			birthMonth: undefined,
			birthDay: undefined,
		},
	})

	const onSubmit = async (data: CreateUserFormValues) => {
		setIsLoading(true)
		setError(null)
		setSuccess(false)

		try {
			// Generate a temporary password - in production, you might want to send an invite email instead
			// const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12) + 'A1!'
			const tempPassword = 'password1'

			console.log('data', data)

			const result = await authClient.admin.createUser({
				email: data.email,
				password: tempPassword,
				name: data.name,
				data: {
					...(data.birthMonth && { birthMonth: data.birthMonth }),
					...(data.birthDay !== undefined && { birthDay: data.birthDay }),
				},
			})

			if (result.error) {
				setError(result.error.message || 'Failed to create user')
			} else {
				setSuccess(true)
				form.reset({
					email: '',
					name: '',
					birthMonth: undefined,
					birthDay: undefined,
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

				<div className="grid grid-cols-2 gap-4">
					<FormField
						control={form.control}
						name="birthMonth"
						render={({ field }) => (
							<FormItem className="w-full">
								<FormLabel>Birth Month</FormLabel>
								<Select onValueChange={value => field.onChange(value || undefined)} value={field.value || ''} disabled={isLoading}>
									<FormControl>
										<SelectTrigger className="w-full">
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
				</div>

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
