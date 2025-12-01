import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { birthMonthEnumValues } from '@/db/enums'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'

const createUserSchema = z.object({
	email: z.email('Invalid email address'),
	name: z.string().min(1, 'Name is required'),
	birthMonth: z.enum(birthMonthEnumValues).optional(),
	birthDay: z
		.number()
		.int('Birth day must be a whole number')
		.min(1, 'Birth day must be between 1 and 31')
		.max(31, 'Birth day must be between 1 and 31')
		.optional(),
})

type CreateUserFormValues = z.infer<typeof createUserSchema>

export function CreateUserForm() {
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [success, setSuccess] = useState(false)

	const form = useForm<CreateUserFormValues>({
		resolver: zodResolver(createUserSchema),
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
				form.reset()
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
								<Select onValueChange={field.onChange} value={field.value} disabled={isLoading}>
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
