import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import type { z } from 'zod'

import { type AffectedList, applyPartnerEditorChanges, getPartnerEditorAffectedLists } from '@/api/list-editors'
import { getPotentialPartners, updateUserProfile } from '@/api/user'
import { BirthDaySelect } from '@/components/common/birth-day-select'
import InputTooltip from '@/components/common/input-tooltip'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { birthMonthEnumValues } from '@/db/schema/enums'
import { UserSchema } from '@/db/schema/users'
import { useAppSetting } from '@/hooks/use-app-settings'
import { useSession } from '@/lib/auth-client'
import { LIMITS } from '@/lib/validation/limits'

import UserAvatar from '../common/user-avatar'
import { Field, FieldDescription, FieldError, FieldLabel } from '../ui/field'

type UpdateProfileFormValues = z.infer<typeof UserSchema>

// Birth-year picker spans 120 years back, newest first so the typical user
// scrolls a short distance instead of paging through 1900s.
const BIRTH_YEAR_RANGE = 120
function birthYearOptions(): Array<number> {
	const now = new Date().getFullYear()
	return Array.from({ length: BIRTH_YEAR_RANGE + 1 }, (_, i) => now - i)
}

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
	birthYear?: number | null
	partnerId?: string | null
	partnerAnniversary?: string | null
}

type EditorChangePrompt = {
	prevPartnerId: string | null
	nextPartnerId: string | null
	prevPartnerLabel: string | null
	nextPartnerLabel: string | null
	toAdd: Array<AffectedList>
	toRemove: Array<AffectedList>
	addSelections: Record<number, boolean>
	removeSelections: Record<number, boolean>
}

export default function ProfileForm({ name, birthMonth, birthDay, birthYear, partnerId, partnerAnniversary }: ProfileFormProps) {
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [success, setSuccess] = useState(false)
	// Holds the pending form values when the user is about to change or clear
	// their partner. Presence of a value opens the confirmation dialog.
	const [pendingPartnerChange, setPendingPartnerChange] = useState<UpdateProfileFormValues | null>(null)
	// Set after a successful save when the partner changed and there are
	// editor adjustments the user can opt into.
	const [editorChangePrompt, setEditorChangePrompt] = useState<EditorChangePrompt | null>(null)
	const [applyingEditorChanges, setApplyingEditorChanges] = useState(false)
	const queryClient = useQueryClient()
	const { data: session, refetch: refetchSession } = useSession()
	const currentUserId = session?.user.id ?? null
	const anniversaryEnabled = useAppSetting('enableAnniversaryReminders')

	// Fetch potential partners
	const { data: potentialPartners = [], isLoading: isLoadingPartners } = useQuery({
		queryKey: ['potentialPartners'],
		queryFn: async () => {
			return await getPotentialPartners()
		},
		staleTime: 10 * 60 * 1000,
	})

	const form = useForm({
		defaultValues: {
			name: name || '',
			birthMonth: birthMonth ?? undefined,
			birthDay: birthDay ?? undefined,
			birthYear: birthYear ?? undefined,
			partnerId: partnerId ?? undefined,
			partnerAnniversary: partnerAnniversary ?? undefined,
		},
		onSubmit: async ({ value }) => {
			// Validate with Zod before submitting (only the fields we're using)
			const result = UserSchema.pick({
				name: true,
				birthMonth: true,
				birthDay: true,
				birthYear: true,
				partnerId: true,
				partnerAnniversary: true,
			}).safeParse(value)
			if (!result.success) {
				setError(result.error.issues.map((e: { message: string }) => e.message).join(', '))
				return
			}
			const parsed = result.data as UpdateProfileFormValues
			// Confirm any change away from an existing partner. This is the only
			// destructive piece of the form: swapping or clearing a partnership
			// also breaks the other side, so we want a deliberate confirm.
			const currentPartner = partnerId ?? null
			const nextPartner = parsed.partnerId || null
			if (currentPartner && currentPartner !== nextPartner) {
				setPendingPartnerChange(parsed)
				return
			}
			await onSubmit(parsed)
		},
	})

	const currentPartnerName = potentialPartners.find(p => p.id === partnerId)?.name ?? null

	const onSubmit = async (data: UpdateProfileFormValues) => {
		setIsLoading(true)
		setError(null)
		setSuccess(false)

		const prevPartnerId = partnerId ?? null
		const nextPartnerId = data.partnerId || null
		const partnerChanged = prevPartnerId !== nextPartnerId

		try {
			const updateData: {
				name: string
				birthMonth?: string | null
				birthDay?: number | null
				birthYear?: number | null
				partnerId?: string | null
				partnerAnniversary?: string | null
			} = {
				name: data.name,
				// Always send partnerId since it's part of the form (undefined/null means clear partner)
				partnerId: data.partnerId || null,
				// Always send anniversary; server ignores it when there is
				// no effective partner and clears both sides otherwise.
				partnerAnniversary: data.partnerAnniversary ? data.partnerAnniversary : null,
			}
			if (data.birthMonth !== undefined) {
				updateData.birthMonth = data.birthMonth
			}
			if (data.birthDay !== undefined) {
				updateData.birthDay = data.birthDay
			}
			if (data.birthYear !== undefined) {
				updateData.birthYear = data.birthYear
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
			// Partner changes flip `cannotBeRestricted` server-side, so the
			// settings/permissions Restricted toggle disables/re-enables for
			// the new (and old) partner. Drop the cache so the next visit
			// refetches with the fresh flag.
			queryClient.invalidateQueries({ queryKey: ['permissions'] })

			if (partnerChanged) {
				const affected = await getPartnerEditorAffectedLists({ data: { prevPartnerId, nextPartnerId } })
				if (affected.toAdd.length > 0 || affected.toRemove.length > 0) {
					const lookupName = (id: string | null): string | null => {
						if (!id) return null
						const u = potentialPartners.find(p => p.id === id)
						return u ? u.name || u.email : null
					}
					setEditorChangePrompt({
						prevPartnerId,
						nextPartnerId,
						prevPartnerLabel: lookupName(prevPartnerId),
						nextPartnerLabel: lookupName(nextPartnerId),
						toAdd: affected.toAdd,
						toRemove: affected.toRemove,
						addSelections: Object.fromEntries(affected.toAdd.map(l => [l.id, true])),
						removeSelections: Object.fromEntries(affected.toRemove.map(l => [l.id, true])),
					})
				}
			}

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

	const applyEditorChanges = async () => {
		if (!editorChangePrompt) return
		setApplyingEditorChanges(true)
		try {
			const addListIds = editorChangePrompt.toAdd.filter(l => editorChangePrompt.addSelections[l.id]).map(l => l.id)
			const removeListIds = editorChangePrompt.toRemove.filter(l => editorChangePrompt.removeSelections[l.id]).map(l => l.id)

			if (addListIds.length === 0 && removeListIds.length === 0) {
				setEditorChangePrompt(null)
				return
			}

			const result = await applyPartnerEditorChanges({
				data: {
					addPartnerId: editorChangePrompt.nextPartnerId,
					addListIds,
					removePartnerId: editorChangePrompt.prevPartnerId,
					removeListIds,
				},
			})

			const parts: Array<string> = []
			if (result.added > 0)
				parts.push(`Added ${editorChangePrompt.nextPartnerLabel ?? 'partner'} to ${result.added} ${result.added === 1 ? 'list' : 'lists'}`)
			if (result.removed > 0)
				parts.push(
					`Removed ${editorChangePrompt.prevPartnerLabel ?? 'former partner'} from ${result.removed} ${result.removed === 1 ? 'list' : 'lists'}`
				)
			if (parts.length > 0) toast.success(parts.join('; '))
			await queryClient.invalidateQueries({ queryKey: ['my-lists'] })
			setEditorChangePrompt(null)
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to update list editors')
		} finally {
			setApplyingEditorChanges(false)
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
			{/* <FieldSet> */}
			{/* <FieldGroup> */}
			<form.Field name="name">
				{field => (
					<Field className="gap-1">
						<FieldLabel htmlFor={field.name}>Name</FieldLabel>
						<Input
							id={field.name}
							type="text"
							placeholder="Ezekiel"
							value={field.state.value}
							onChange={e => field.handleChange(e.target.value)}
							onBlur={field.handleBlur}
							disabled={isLoading}
							maxLength={LIMITS.SHORT_NAME}
						/>
						{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
							<FieldError className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</FieldError>
						)}
					</Field>
				)}
			</form.Field>

			<div className="grid grid-cols-1 gap-4 @md/subpage:grid-cols-2">
				<form.Field name="birthMonth">
					{field => (
						<Field className="gap-1">
							<FieldLabel htmlFor={field.name}>Birth Month</FieldLabel>
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
								<FieldError className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</FieldError>
							)}
						</Field>
					)}
				</form.Field>

				<form.Field name="birthDay">
					{field => (
						<Field className="gap-1">
							<FieldLabel htmlFor={field.name}>Birth Day</FieldLabel>
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
								<FieldError className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</FieldError>
							)}
						</Field>
					)}
				</form.Field>
			</div>

			<form.Field name="birthYear">
				{field => (
					<Field className="gap-1">
						<FieldLabel htmlFor={field.name} className="flex items-center gap-1.5">
							Birth Year
							<InputTooltip>Optional. Used only to tailor recommendations and your experience. Never displayed publicly.</InputTooltip>
						</FieldLabel>
						<Select
							value={field.state.value ? String(field.state.value) : ''}
							onValueChange={value => field.handleChange(value === '' ? undefined : Number(value))}
							disabled={isLoading}
						>
							<SelectTrigger id={field.name} className="w-full @md/subpage:w-40">
								<SelectValue placeholder="Select year" />
							</SelectTrigger>
							<SelectContent>
								{birthYearOptions().map(year => (
									<SelectItem key={year} value={String(year)}>
										{year}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
							<FieldError className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</FieldError>
						)}
					</Field>
				)}
			</form.Field>

			<form.Field name="partnerId">
				{field => (
					<Field className="gap-1">
						<FieldLabel htmlFor={field.name}>Partner</FieldLabel>
						<FieldDescription className="text-xs leading-tight">
							When a partner is selected, gifts are typically shown as given by both of you.
						</FieldDescription>
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
								{potentialPartners.map(partnerUser => {
									const alreadyPartnered = !!partnerUser.partnerId && partnerUser.partnerId !== currentUserId
									return (
										<SelectItem key={partnerUser.id} value={partnerUser.id} disabled={alreadyPartnered}>
											<span className="flex items-center gap-2">
												<UserAvatar name={partnerUser.name || partnerUser.email} image={partnerUser.image} size="small" />
												{partnerUser.name || partnerUser.email}
												{partnerUser.role === 'admin' && <span className="text-xs text-muted-foreground">(Admin)</span>}
												{alreadyPartnered && <span className="text-xs text-muted-foreground">(already partnered)</span>}
											</span>
										</SelectItem>
									)
								})}
							</SelectContent>
						</Select>
						{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
							<FieldError className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</FieldError>
						)}
					</Field>
				)}
			</form.Field>

			<form.Subscribe selector={state => state.values.partnerId}>
				{selectedPartnerId =>
					selectedPartnerId && anniversaryEnabled ? (
						<form.Field name="partnerAnniversary">
							{field => (
								<Field className="gap-1">
									<FieldLabel htmlFor={field.name} className="flex items-center gap-1.5">
										Anniversary
										<InputTooltip>Optional. Shared with your partner so it appears on both your profiles.</InputTooltip>
									</FieldLabel>
									{/*
									 * Native `<input type="date">` fights controlled-value
									 * re-renders: each keystroke in the year segment fires
									 * onChange with the empty string until the whole date
									 * is valid, so React snaps the year back and only the
									 * arrow keys actually scroll. DatePicker buffers the
									 * partial typed value locally and only emits a complete
									 * `YYYY-MM-DD` string to the form, then provides a
									 * calendar popover with a year dropdown for clickers.
									 */}
									<DatePicker
										id={field.name}
										value={field.state.value ?? undefined}
										onChange={next => field.handleChange(next)}
										onBlur={field.handleBlur}
										disabled={isLoading}
										className="w-full @md/subpage:w-64"
									/>
									{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
										<FieldError className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</FieldError>
									)}
								</Field>
							)}
						</form.Field>
					) : null
				}
			</form.Subscribe>
			{/* </FieldGroup> */}
			{/* // </FieldSet> */}

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

			<AlertDialog
				open={pendingPartnerChange != null}
				onOpenChange={open => {
					if (!open) setPendingPartnerChange(null)
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{pendingPartnerChange?.partnerId ? 'Change Partner?' : 'Remove Partner?'}</AlertDialogTitle>
						<AlertDialogDescription>
							{currentPartnerName
								? `You are currently partnered with ${currentPartnerName}. Saving will unlink them and stop showing gifts as given by both of you.`
								: 'Saving will unlink your current partner and stop showing gifts as given by both of you.'}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={async () => {
								const pending = pendingPartnerChange
								setPendingPartnerChange(null)
								if (pending) await onSubmit(pending)
							}}
						>
							{pendingPartnerChange?.partnerId ? 'Change partner' : 'Remove partner'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<Dialog
				open={editorChangePrompt != null}
				onOpenChange={open => {
					if (!open && !applyingEditorChanges) setEditorChangePrompt(null)
				}}
			>
				<DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Update List Editors?</DialogTitle>
						<DialogDescription>Your partner change affects who has editor access on some of your lists.</DialogDescription>
					</DialogHeader>
					{editorChangePrompt && (
						<div className="space-y-5">
							{editorChangePrompt.toAdd.length > 0 && (
								<section className="space-y-2">
									<h3 className="text-sm font-medium">Add {editorChangePrompt.nextPartnerLabel ?? 'partner'} as an editor on:</h3>
									<ul className="space-y-1.5">
										{editorChangePrompt.toAdd.map(list => {
											const id = `add-${list.id}`
											const checked = editorChangePrompt.addSelections[list.id] ?? false
											return (
												<li key={list.id} className="flex items-center gap-2">
													<Checkbox
														id={id}
														checked={checked}
														onCheckedChange={v =>
															setEditorChangePrompt(prev =>
																prev ? { ...prev, addSelections: { ...prev.addSelections, [list.id]: v === true } } : prev
															)
														}
														disabled={applyingEditorChanges}
													/>
													<Label htmlFor={id} className="text-sm font-normal">
														{list.name}
													</Label>
												</li>
											)
										})}
									</ul>
								</section>
							)}
							{editorChangePrompt.toRemove.length > 0 && (
								<section className="space-y-2">
									<h3 className="text-sm font-medium">
										Remove {editorChangePrompt.prevPartnerLabel ?? 'former partner'} as an editor from:
									</h3>
									<ul className="space-y-1.5">
										{editorChangePrompt.toRemove.map(list => {
											const id = `remove-${list.id}`
											const checked = editorChangePrompt.removeSelections[list.id] ?? false
											return (
												<li key={list.id} className="flex items-center gap-2">
													<Checkbox
														id={id}
														checked={checked}
														onCheckedChange={v =>
															setEditorChangePrompt(prev =>
																prev ? { ...prev, removeSelections: { ...prev.removeSelections, [list.id]: v === true } } : prev
															)
														}
														disabled={applyingEditorChanges}
													/>
													<Label htmlFor={id} className="text-sm font-normal">
														{list.name}
													</Label>
												</li>
											)
										})}
									</ul>
								</section>
							)}
						</div>
					)}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setEditorChangePrompt(null)} disabled={applyingEditorChanges}>
							Skip
						</Button>
						<Button type="button" onClick={applyEditorChanges} disabled={applyingEditorChanges}>
							{applyingEditorChanges ? 'Updating…' : 'Apply changes'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</form>
	)
}
