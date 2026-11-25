import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { z } from 'zod'

import { createGuardianships, getUsersAsAdmin, updateUserPartner, upsertViewerRelationshipsAsAdmin } from '@/api/admin'
import { adminUserIssueText } from '@/components/admin/edit-user-form'
import { roleLabel, RoleLegend } from '@/components/admin/role-legend'
import { BirthDaySelect } from '@/components/common/birth-day-select'
import InputTooltip from '@/components/common/input-tooltip'
import { RichMessage } from '@/components/common/rich-message'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { birthMonthEnumValues, roleEnumValues } from '@/db/schema/enums'
import { UserSchema } from '@/db/schema/users'
import type { User } from '@/db-collections/users'
import { useCurrentYear } from '@/hooks/use-current-year'
import { authClient } from '@/lib/auth-client'
import { authErrorText, errorText } from '@/lib/i18n/errors'
import { monthName } from '@/lib/i18n/labels'
import { LIMITS } from '@/lib/validation/limits'
import { m } from '@/paraglide/messages.js'

import UserAvatar from '../common/user-avatar'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'

// The new user's default access to every EXISTING user's lists. Viewer
// direction: 'view' is the system default (authenticated users see public
// lists), so it's a no-op; 'restricted' / 'none' write override rows. No
// 'edit' tier - you don't grant a fresh user edit access to everyone.
type DefaultAccess = 'view' | 'restricted' | 'none'

type CreateUserFormValues = z.infer<typeof UserSchema> & { defaultAccess: DefaultAccess }

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

export function CreateUserForm({ onCreated }: { onCreated?: () => void } = { onCreated: undefined }) {
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [success, setSuccess] = useState(false)
	const currentYear = useCurrentYear()
	const queryClient = useQueryClient()

	const form = useForm({
		defaultValues: {
			email: '',
			name: '',
			role: 'user' as (typeof roleEnumValues)[number],
			birthMonth: undefined as (typeof birthMonthEnumValues)[number] | undefined,
			birthDay: undefined as number | undefined,
			birthYear: undefined as number | undefined,
			guardianIds: [] as Array<string>,
			partnerId: undefined as string | undefined,
			defaultAccess: 'view' as DefaultAccess,
		},
		onSubmit: async ({ value }) => {
			// Validate with Zod before submitting. UserSchema strips the extra
			// `defaultAccess` key, so validate the user fields and carry the
			// raw value (with defaultAccess intact) into onSubmit.
			const result = UserSchema.safeParse(value)
			if (!result.success) {
				setError(result.error.issues.map(adminUserIssueText).join(', '))
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
		staleTime: 10 * 60 * 1000,
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
					...(data.birthYear !== undefined && { birthYear: data.birthYear }),
					...(data.partnerId && { partnerId: data.partnerId }),
				},
			})

			if (result.error) {
				setError(authErrorText(result.error, m.admin_users_create_failed()))
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
						setError(m.admin_users_create_guardians_failed())
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
						setError(m.admin_users_create_partner_failed())
						setIsLoading(false)
						return
					}
				}

				// Apply the default access this user gets to everyone else's
				// lists. 'view' is the system default (no rows needed); for
				// 'restricted' / 'none' we write one viewer-direction override
				// row per existing user. Partners and guardians are excluded
				// because they always resolve to full view: a 'none' row would be
				// dead data (the resolver short-circuits those pairs to 'view'),
				// and a 'restricted' row is rejected outright as a data invariant
				// (restricted-not-allowed), which would fail the whole batch.
				if (userId && data.defaultAccess !== 'view') {
					const excludedOwnerIds = new Set<string>([...(data.partnerId ? [data.partnerId] : []), ...(data.guardianIds ?? [])])
					const owners = allUsers.filter(u => u.id !== userId && !excludedOwnerIds.has(u.id))
					if (owners.length > 0) {
						try {
							const accessResult = await upsertViewerRelationshipsAsAdmin({
								data: {
									userId,
									input: {
										relationships: owners.map(owner => ({
											ownerUserId: owner.id,
											accessLevel: data.defaultAccess,
										})),
									},
								},
							})
							if (!accessResult.success) {
								setError(m.admin_users_create_access_failed())
								setIsLoading(false)
								return
							}
						} catch (accessError) {
							console.error('Failed to apply default access:', accessError)
							setError(m.admin_users_create_access_failed())
							setIsLoading(false)
							return
						}
					}
				}

				setSuccess(true)
				form.reset()
				// Invalidate and refetch the users query to update the impersonation dropdown
				queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
				// Clear success message after 5 seconds
				setTimeout(() => setSuccess(false), 5000)
				onCreated?.()
			}
		} catch (err) {
			setError(errorText(err, m.admin_users_create_failed()))
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
						<Label htmlFor={field.name}>{m.admin_users_form_email_label()}</Label>
						<Input
							id={field.name}
							type="email"
							placeholder={m.admin_users_form_email_placeholder()}
							value={field.state.value}
							onChange={e => field.handleChange(e.target.value)}
							onBlur={field.handleBlur}
							disabled={isLoading}
							maxLength={LIMITS.EMAIL}
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
						<Label htmlFor={field.name}>{m.admin_users_form_name_label()}</Label>
						<Input
							id={field.name}
							name="person-full-name"
							autoComplete="off"
							data-1p-ignore
							data-lpignore="true"
							type="text"
							placeholder={m.admin_users_form_name_placeholder()}
							value={field.state.value}
							onChange={e => field.handleChange(e.target.value)}
							onBlur={field.handleBlur}
							disabled={isLoading}
							maxLength={LIMITS.SHORT_NAME}
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
							<Label htmlFor={field.name}>{m.admin_users_form_birth_month_label()}</Label>
							<Select
								onValueChange={value => {
									field.handleChange(value === '' ? undefined : (value as (typeof birthMonthEnumValues)[number]))
								}}
								value={field.state.value ?? ''}
								disabled={isLoading}
							>
								<SelectTrigger id={field.name} className="w-full">
									<SelectValue placeholder={m.admin_users_form_birth_month_placeholder()} />
								</SelectTrigger>
								<SelectContent>
									{birthMonthEnumValues.map(month => (
										<SelectItem key={month} value={month}>
											{monthName(month)}
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
							<Label htmlFor={field.name}>{m.admin_users_form_birth_day_label()}</Label>
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

				<form.Field name="birthYear">
					{field => (
						<div className="grid gap-2 w-full">
							<Label htmlFor={field.name} className="flex items-center gap-1.5">
								{m.admin_users_form_birth_year_label()}
								<InputTooltip>{m.admin_users_form_birth_year_help()}</InputTooltip>
							</Label>
							<Input
								id={field.name}
								type="number"
								inputMode="numeric"
								min={1900}
								max={currentYear}
								placeholder={m.admin_users_form_birth_year_placeholder()}
								value={field.state.value ?? ''}
								onChange={e => {
									const raw = e.target.value
									if (raw === '') {
										field.handleChange(undefined)
										return
									}
									const parsed = Number.parseInt(raw, 10)
									field.handleChange(Number.isNaN(parsed) ? undefined : parsed)
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
			</div>

			<form.Field name="role">
				{field => (
					<div className="grid gap-2 w-full">
						<Label htmlFor={field.name}>{m.admin_users_form_role_label()}</Label>
						<Select
							onValueChange={value => field.handleChange(value as (typeof roleEnumValues)[number])}
							value={field.state.value}
							disabled={isLoading}
						>
							<SelectTrigger id={field.name} className="w-full">
								<SelectValue placeholder={m.admin_users_form_role_placeholder()} />
							</SelectTrigger>
							<SelectContent>
								{roleEnumValues.map(role => (
									<SelectItem key={role} value={role}>
										{roleLabel(role)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<RoleLegend />
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
										{m.admin_users_form_guardians_label()}
										<InputTooltip>{m.admin_users_form_guardians_help()}</InputTooltip>
									</Label>
									<div className="border rounded-md p-4 max-h-60 overflow-y-auto space-y-2">
										{isLoadingUsers ? (
											<div className="text-sm text-muted-foreground">{m.admin_users_form_loading_users()}</div>
										) : guardianOptions.length === 0 ? (
											<div className="text-sm text-muted-foreground">{m.admin_users_form_no_users()}</div>
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
															{guardianUser.role === 'admin' && (
																<span className="text-xs text-muted-foreground"> {m.admin_users_admin_tag()}</span>
															)}
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
									<Label htmlFor={field.name}>{m.admin_users_form_partner_label()}</Label>
									<Select
										onValueChange={value => {
											field.handleChange(value === '__none__' ? undefined : value)
										}}
										value={field.state.value || '__none__'}
										disabled={isLoading}
									>
										<SelectTrigger id={field.name} className="w-full">
											<SelectValue placeholder={m.admin_users_form_partner_placeholder()} />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="__none__">{m.admin_users_form_partner_none()}</SelectItem>
											{partnerOptions.map(partnerUser => (
												<SelectItem key={partnerUser.id} value={partnerUser.id}>
													<UserAvatar name={partnerUser.name || partnerUser.email} image={partnerUser.image} size="small" />
													<span className="truncate">
														{partnerUser.role === 'admin'
															? m.admin_users_name_with_admin({ name: partnerUser.name || partnerUser.email })
															: partnerUser.name || partnerUser.email}
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
					)
				}
			</form.Subscribe>

			<form.Field name="defaultAccess">
				{field => (
					<div className="grid gap-2">
						<Label htmlFor={field.name} className="flex items-center gap-1.5">
							{m.admin_users_create_access_label()}
							<InputTooltip>
								<RichMessage parts={m.admin_users_create_access_help.parts()} tags={{ strong: c => <strong>{c}</strong> }} />
							</InputTooltip>
						</Label>
						<Select onValueChange={value => field.handleChange(value as DefaultAccess)} value={field.state.value} disabled={isLoading}>
							<SelectTrigger id={field.name} className="w-full">
								<SelectValue placeholder={m.admin_users_create_access_placeholder()} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="view">{m.admin_users_create_access_view()}</SelectItem>
								<SelectItem value="restricted">{m.admin_users_create_access_restricted()}</SelectItem>
								<SelectItem value="none">{m.admin_users_create_access_none()}</SelectItem>
							</SelectContent>
						</Select>
					</div>
				)}
			</form.Field>

			{error && (
				<Alert variant="destructive">
					<AlertTitle>{m.admin_users_form_error_title()}</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			{success && (
				<Alert variant="default">
					<AlertTitle>{m.admin_users_create_success_title()}</AlertTitle>
					<AlertDescription>{m.admin_users_create_success_body()}</AlertDescription>
				</Alert>
			)}

			<Button type="submit" disabled={isLoading} className="w-full" variant="default">
				{isLoading ? m.admin_users_create_submitting() : m.admin_users_create_submit()}
			</Button>
		</form>
	)
}
