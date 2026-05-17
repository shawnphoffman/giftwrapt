import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { z } from 'zod'

import {
	deleteUserAsAdmin,
	getGuardianshipsForChild,
	getUserRelationshipsAsAdmin,
	getUsersAsAdmin,
	updateGuardianships,
	updateUserAsAdmin,
	upsertUserRelationshipsAsAdmin,
} from '@/api/admin'
import { removeAvatarAsAdmin, uploadAvatarAsAdmin } from '@/api/uploads'
import { RoleLegend } from '@/components/admin/role-legend'
import { BirthDaySelect } from '@/components/common/birth-day-select'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import InputTooltip from '@/components/common/input-tooltip'
import UserAvatar from '@/components/common/user-avatar'
import AvatarUpload from '@/components/settings/avatar-upload'
import { fromTier, type PermissionRow, PermissionsEditor, toTier } from '@/components/settings/permissions-editor'
import { adminOpsFor, RelationLabelsSection } from '@/components/settings/relation-labels-section'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { birthMonthEnumValues, roleEnumValues } from '@/db/schema/enums'
import { type User as DbUser, UserSchema } from '@/db/schema/users'
import type { User } from '@/db-collections/users'
import { useStorageStatus } from '@/hooks/use-storage-status'
import { useSession } from '@/lib/auth-client'
import { LIMITS } from '@/lib/validation/limits'

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

export function EditUserForm({ userId, onSuccess }: { userId: string; onSuccess?: () => void }) {
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
		staleTime: 10 * 60 * 1000,
	})

	// Permissions are fetched here so the master submit can save them in
	// the same round-trip as the rest of the form. The editor used to
	// have its own Save button which was easy to miss.
	const { data: relationships, isLoading: isLoadingRelationships } = useQuery({
		queryKey: ['admin', 'permissions', userId],
		queryFn: () => getUserRelationshipsAsAdmin({ data: { userId } }),
		staleTime: 10 * 60 * 1000,
		refetchOnMount: 'always',
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
			initialPermissionRows={
				relationships
					? relationships.map(r => ({
							id: r.id,
							email: r.email,
							name: r.name,
							image: r.image,
							access: toTier(r.accessLevel, r.canEdit),
							cannotBeRestricted: r.cannotBeRestricted,
						}))
					: null
			}
			isLoadingRelationships={isLoadingRelationships}
			queryClient={queryClient}
			onSuccess={onSuccess}
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
	initialPermissionRows,
	isLoadingRelationships,
	queryClient,
	onSuccess,
}: {
	user: DbUser
	userId: string
	existingGuardianIds: Array<string>
	isLoadingGuardianships: boolean
	isLoadingUsers: boolean
	guardianOptions: Array<User>
	partnerOptions: Array<User>
	initialPermissionRows: Array<PermissionRow> | null
	isLoadingRelationships: boolean
	queryClient: ReturnType<typeof useQueryClient>
	onSuccess?: () => void
}) {
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const { configured: storageConfigured } = useStorageStatus()
	const navigate = useNavigate()
	const { data: session } = useSession()
	const isSelf = session?.user.id === userId

	// Mirror of the editor's current rows so the master submit can persist
	// permissions changes alongside user info + guardianships in one go.
	// Seeded from the initial fetch; the embedded PermissionsEditor pushes
	// updates back through onChange.
	const [permissionRows, setPermissionRows] = useState<Array<PermissionRow> | null>(initialPermissionRows)
	useEffect(() => {
		if (initialPermissionRows) setPermissionRows(initialPermissionRows)
	}, [initialPermissionRows])

	const form = useForm({
		defaultValues: {
			email: user.email || '',
			name: user.name || '',
			role: user.role,
			birthMonth: user.birthMonth ?? undefined,
			birthDay: user.birthDay ?? undefined,
			birthYear: user.birthYear ?? undefined,
			guardianIds: existingGuardianIds,
			partnerId: user.partnerId ?? undefined,
			partnerAnniversary: user.partnerAnniversary ?? undefined,
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

		try {
			// Normalize partnerId (handle __none__ case)
			const normalizedPartnerId = data.partnerId === '__none__' ? null : data.partnerId || null
			const normalizedAnniversary = data.partnerAnniversary ? data.partnerAnniversary : null

			// Update user basic info. updateUserAsAdmin now handles the
			// bidirectional partner + anniversary mirror via the shared
			// `applyPartnerAndAnniversary` helper, so we no longer need
			// the second `updateUserPartner` round-trip.
			await updateUserAsAdmin({
				data: {
					userId,
					email: data.email,
					name: data.name,
					role: data.role,
					birthMonth: data.birthMonth ?? null,
					birthDay: data.birthDay ?? null,
					birthYear: data.birthYear ?? null,
					image: data.image === '' ? null : data.image || null,
					partnerId: normalizedPartnerId,
					partnerAnniversary: normalizedAnniversary,
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

			// Persist permission edits. Folded into the master submit so the
			// dialog has a single Update button instead of the older split where
			// permissions had their own Save action.
			if (permissionRows) {
				try {
					const result = await upsertUserRelationshipsAsAdmin({
						data: {
							userId,
							input: {
								relationships: permissionRows.map(row => ({
									viewerUserId: row.id,
									...fromTier(row.access),
								})),
							},
						},
					})
					if (!result.success) {
						setError('Some users cannot be set to restricted (partner or guardian relationships are always full view).')
						setIsLoading(false)
						return
					}
					queryClient.invalidateQueries({ queryKey: ['admin', 'permissions', userId] })
				} catch (permError) {
					console.error('Failed to update permissions:', permError)
					setError('User updated but failed to update permissions. Please try again.')
					setIsLoading(false)
					return
				}
			}

			toast.success(`${data.name || data.email} updated`)
			// Invalidate queries to refresh data
			queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] })
			queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
			queryClient.invalidateQueries({ queryKey: ['admin', 'guardianships', userId] })
			onSuccess?.()
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
			{/* Avatar */}
			<form.Subscribe selector={state => ({ name: state.values.name, image: state.values.image })}>
				{({ name, image }) => {
					const previewImage = image?.trim() ? image : null
					return (
						<div className="flex items-center gap-4 pb-4 border-b">
							<AvatarUpload
								image={previewImage}
								displayName={name || user.name || user.email || ''}
								onUpload={async file => {
									const formData = new FormData()
									formData.append('file', file)
									formData.append('userId', userId)
									return await uploadAvatarAsAdmin({ data: formData })
								}}
								onRemove={() => removeAvatarAsAdmin({ data: { userId } })}
								onSuccess={async nextImage => {
									form.setFieldValue('image', nextImage ?? undefined)
									await queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] })
									await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
								}}
							/>
							<div className="flex-1">
								<p className="text-sm font-medium">Avatar</p>
								<p className="text-xs text-muted-foreground">
									{storageConfigured ? 'Click to upload, or paste a URL below' : 'Paste a URL below'}
								</p>
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
						<Label htmlFor={field.name}>Name</Label>
						<Input
							id={field.name}
							type="text"
							placeholder="John Doe"
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

			<form.Field name="image">
				{field => (
					<div className="grid gap-2">
						<Label htmlFor={field.name}>Image URL</Label>
						<Input
							id={field.name}
							type="text"
							placeholder="https://example.com/avatar.jpg"
							value={field.state.value ?? ''}
							onChange={e => {
								const value = e.target.value
								// Convert empty string to null immediately
								field.handleChange(value.trim() === '' ? undefined : value.trim())
							}}
							onBlur={field.handleBlur}
							disabled={isLoading}
							maxLength={LIMITS.URL}
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

				<form.Field name="birthYear">
					{field => (
						<div className="grid gap-2 w-full">
							<Label htmlFor={field.name} className="flex items-center gap-1.5">
								Birth Year
								<InputTooltip>
									Optional. Used only to tailor recommendations and the user's experience. Never displayed publicly.
								</InputTooltip>
							</Label>
							<Input
								id={field.name}
								type="number"
								inputMode="numeric"
								min={1900}
								max={new Date().getFullYear()}
								placeholder="YYYY"
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
						<Label htmlFor={field.name}>Role</Label>
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
						<>
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
														<UserAvatar name={partnerUser.name || partnerUser.email} image={partnerUser.image} size="small" />
														<span className="truncate">
															{partnerUser.name || partnerUser.email}
															{partnerUser.role === 'admin' && ' (Admin)'}
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

							<form.Subscribe selector={state => state.values.partnerId}>
								{selectedPartnerId =>
									selectedPartnerId && selectedPartnerId !== '__none__' ? (
										<form.Field name="partnerAnniversary">
											{field => (
												<div className="grid gap-2">
													<Label htmlFor={field.name} className="flex items-center gap-1.5">
														Partner Anniversary
														<InputTooltip>Optional. Mirrored onto both partners so the date appears on either profile.</InputTooltip>
													</Label>
													<DatePicker
														id={field.name}
														value={field.state.value ?? undefined}
														onChange={next => field.handleChange(next)}
														onBlur={field.handleBlur}
														disabled={isLoading}
														className="w-full sm:w-72"
													/>
													{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
														<p className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</p>
													)}
												</div>
											)}
										</form.Field>
									) : null
								}
							</form.Subscribe>
						</>
					)
				}
			</form.Subscribe>

			{error && (
				<Alert variant="destructive">
					<AlertTitle>Error</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<div className="grid gap-2 pt-2 border-t">
				<h3 className="pt-2 font-medium text-2xl">Relationships</h3>
				<p className="text-xs text-muted-foreground">People this user shops for on Mother’s Day and Father’s Day.</p>
				<RelationLabelsSection ops={adminOpsFor(userId)} hideDependents />
			</div>

			<div className="grid gap-2 pt-2 border-t">
				<h3 className="pt-2 font-medium text-2xl">Permissions</h3>
				<p className="text-xs text-muted-foreground">
					Choose what each person can do with <strong>{user.name || user.email}</strong>'s wish lists. Partners and guardians always have
					full view.
				</p>
				<PermissionsEditor
					embedded
					rows={permissionRows}
					isLoading={isLoadingRelationships || permissionRows === null}
					isSaving={isLoading}
					onChange={setPermissionRows}
					showShareIndicator={false}
				/>
			</div>

			<Button type="submit" disabled={isLoading} className="w-full" variant="default">
				{isLoading ? 'Updating user...' : 'Update User'}
			</Button>

			{!isSelf && (
				<div className="border-t pt-4 space-y-2">
					<div>
						<h3 className="text-2xl font-medium text-destructive">Danger Zone</h3>
						<p className="text-xs text-muted-foreground mt-2">
							Permanently delete this user. Their lists, items, claims, comments, and partner/guardian links will all be removed.
						</p>
					</div>
					<Button type="button" variant="destructive" className="w-full" onClick={() => setDeleteDialogOpen(true)} disabled={isLoading}>
						Delete User
					</Button>
					<ConfirmDialog
						open={deleteDialogOpen}
						onOpenChange={setDeleteDialogOpen}
						destructive
						title={`Delete ${user.name || user.email}?`}
						description={
							<>
								This permanently deletes the account, all lists they own and every item, claim, and comment on those lists, all gift claims
								they made on other users' lists, all guardianship and partner links, and their stored avatar.
								<br />
								<br />
								<strong>This cannot be undone.</strong>
							</>
						}
						confirmLabel="Delete User"
						confirmBusyLabel="Deleting..."
						onConfirm={async () => {
							const result = await deleteUserAsAdmin({ data: { userId } })
							if (result.kind === 'error') {
								const message =
									result.reason === 'self-delete'
										? "You can't delete your own account from here."
										: 'User not found. They may have already been deleted.'
								toast.error(message)
								setError(message)
								throw new Error(message)
							}
							toast.success(`${user.name || user.email} deleted`)
							// Navigate first so the edit form unmounts before we touch its
							// queries; otherwise removeQueries triggers a refetch on the
							// still-mounted observer and the deleted-user lookup returns
							// undefined.
							await navigate({ to: '/admin/users' })
							queryClient.removeQueries({ queryKey: ['admin', 'user', userId] })
							queryClient.removeQueries({ queryKey: ['admin', 'guardianships', userId] })
							await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
						}}
					/>
				</div>
			)}
		</form>
	)
}
