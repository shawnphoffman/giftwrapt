import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'

import { updateUserProfile } from '@/api/user'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { birthMonthEnumValues } from '@/db/schema/enums'
import { UserSchema } from '@/db/schema/users'

type UpdateProfileFormValues = z.infer<typeof UserSchema>

type ProfileFormProps = {
	name: string
	birthMonth?: string | null
	birthDay?: number | null
}

export default function ProfileForm({ name, birthMonth, birthDay }: ProfileFormProps) {
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [success, setSuccess] = useState(false)
	const queryClient = useQueryClient()

	const form = useForm<UpdateProfileFormValues>({
		resolver: zodResolver(UserSchema),
		defaultValues: {
			name: name || '',
			birthMonth: birthMonth as (typeof birthMonthEnumValues)[number],
			birthDay: birthDay || undefined,
		},
	})

	const onSubmit = async (data: UpdateProfileFormValues) => {
		setIsLoading(true)
		setError(null)
		setSuccess(false)

		try {
			await updateUserProfile({
				data: {
					name: data.name,
					birthMonth: data.birthMonth,
					birthDay: data.birthDay,
				},
			})

			setSuccess(true)
			toast.success('Profile updated successfully')
			// Invalidate session query to refresh user data
			queryClient.invalidateQueries({ queryKey: ['session'] })
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
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 space-y-4" id="update-profile-form">
				<FormField
					control={form.control}
					name="name"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Name</FormLabel>
							<FormControl>
								<Input type="text" placeholder="Ezekiel" {...field} disabled={isLoading} />
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
										type="text"
										placeholder="Day (1-31)"
										className="w-full"
										onChange={e => {
											const value = e.target.value
											if (value === '') {
												field.onChange(undefined)
											} else {
												const num = parseInt(value, 10)
												if (!isNaN(num)) {
													// Clamp value between 1 and 31
													const clamped = Math.min(Math.max(num, 1), 31)
													field.onChange(clamped)
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
				)}
				{success && (
					<Alert variant="default">
						<AlertTitle>Success</AlertTitle>
						<AlertDescription>Profile updated successfully!</AlertDescription>
					</Alert>
				)}
				<Button type="submit" disabled={isLoading}>
					Update Profile
				</Button>
			</form>
		</Form>
	)
}
