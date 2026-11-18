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
import { errorText, UserFacingError } from '@/lib/i18n/errors'
import { monthName } from '@/lib/i18n/labels'
import { zodParams } from '@/lib/i18n/zod'
import { LIMITS } from '@/lib/validation/limits'
import { m } from '@/paraglide/messages.js'

import UserAvatar from '../common/user-avatar'
import { Field, FieldDescription, FieldError, FieldLabel } from '../ui/field'

type UpdateProfileFormValues = z.infer<typeof UserSchema>

// UserSchema is shared with the server and keeps plain English messages for
// API consumers. What the form shows comes from the catalog, chosen by which
// field failed.
function profileIssueText(issue: z.core.$ZodIssue): string {
	switch (issue.path[0]) {
		case 'name':
			return issue.code === 'too_big' ? m.settings_profile_name_too_long({ max: LIMITS.SHORT_NAME }) : m.settings_profile_name_required()
		case 'birthDay':
			return m.settings_profile_birth_day_invalid()
		case 'birthYear':
			return m.settings_profile_birth_year_invalid()
		case 'partnerAnniversary':
			return m.settings_profile_anniversary_invalid()
		default:
			return issue.message
	}
}

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
	// Children cannot have a partner (server-enforced), so the partner and
	// anniversary fields are hidden for them entirely.
	const isChild = session?.user.isChild ?? false
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
			}).safeParse(value, zodParams())
			if (!result.success) {
				setError([...new Set(result.error.issues.map(profileIssueText))].join(', '))
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
			const updated = await updateUserProfile({
				data: updateData,
			})
			if (!updated.success) throw new UserFacingError(m.settings_profile_child_partner())

			setSuccess(true)
			toast.success(m.settings_profile_updated_toast())
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
			const errorMessage = errorText(err, m.settings_profile_update_failed())
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

			const { nextPartnerLabel, prevPartnerLabel } = editorChangePrompt
			const addedText =
				result.added > 0
					? nextPartnerLabel != null
						? m.settings_profile_editors_added({ name: nextPartnerLabel, count: result.added })
						: m.settings_profile_editors_added_unnamed({ count: result.added })
					: null
			const removedText =
				result.removed > 0
					? prevPartnerLabel != null
						? m.settings_profile_editors_removed({ name: prevPartnerLabel, count: result.removed })
						: m.settings_profile_editors_removed_unnamed({ count: result.removed })
					: null
			const summary =
				addedText && removedText
					? m.settings_profile_editors_added_and_removed({ added: addedText, removed: removedText })
					: (addedText ?? removedText)
			if (summary) toast.success(summary)
			await queryClient.invalidateQueries({ queryKey: ['my-lists'] })
			setEditorChangePrompt(null)
		} catch (err) {
			toast.error(errorText(err, m.settings_profile_editors_update_failed()))
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
						<FieldLabel htmlFor={field.name}>{m.settings_profile_name_label()}</FieldLabel>
						<Input
							id={field.name}
							type="text"
							placeholder={m.settings_profile_name_placeholder()}
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
							<FieldLabel htmlFor={field.name}>{m.settings_profile_birth_month_label()}</FieldLabel>
							<Select
								onValueChange={value => {
									field.handleChange(value === '' ? undefined : (value as (typeof birthMonthEnumValues)[number]))
								}}
								value={field.state.value ?? ''}
								disabled={isLoading}
							>
								<SelectTrigger id={field.name} className="w-full">
									<SelectValue placeholder={m.settings_profile_birth_month_placeholder()} />
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
								<FieldError className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</FieldError>
							)}
						</Field>
					)}
				</form.Field>

				<form.Field name="birthDay">
					{field => (
						<Field className="gap-1">
							<FieldLabel htmlFor={field.name}>{m.settings_profile_birth_day_label()}</FieldLabel>
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
							{m.settings_profile_birth_year_label()}
							<InputTooltip>{m.settings_profile_birth_year_tooltip()}</InputTooltip>
						</FieldLabel>
						<Select
							value={field.state.value ? String(field.state.value) : ''}
							onValueChange={value => field.handleChange(value === '' ? undefined : Number(value))}
							disabled={isLoading}
						>
							<SelectTrigger id={field.name} className="w-full @md/subpage:w-40">
								<SelectValue placeholder={m.settings_profile_birth_year_placeholder()} />
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

			{!isChild && (
				<form.Field name="partnerId">
					{field => (
						<Field className="gap-1">
							<FieldLabel htmlFor={field.name}>{m.settings_profile_partner_label()}</FieldLabel>
							<FieldDescription className="text-xs leading-tight">{m.settings_profile_partner_description()}</FieldDescription>
							<Select
								onValueChange={value => {
									field.handleChange(value === '__none__' ? undefined : value)
								}}
								value={field.state.value || '__none__'}
								disabled={isLoading || isLoadingPartners}
							>
								<SelectTrigger id={field.name} className="w-full">
									<SelectValue placeholder={m.settings_profile_partner_placeholder()} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="__none__">{m.state_none()}</SelectItem>
									{potentialPartners.map(partnerUser => {
										const alreadyPartnered = !!partnerUser.partnerId && partnerUser.partnerId !== currentUserId
										return (
											<SelectItem key={partnerUser.id} value={partnerUser.id} disabled={alreadyPartnered}>
												<span className="flex items-center gap-2">
													<UserAvatar name={partnerUser.name || partnerUser.email} image={partnerUser.image} size="small" />
													{partnerUser.name || partnerUser.email}
													{partnerUser.role === 'admin' && (
														<span className="text-xs text-muted-foreground">{m.settings_profile_partner_admin_tag()}</span>
													)}
													{alreadyPartnered && (
														<span className="text-xs text-muted-foreground">{m.settings_profile_partner_taken_tag()}</span>
													)}
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
			)}

			<form.Subscribe selector={state => state.values.partnerId}>
				{selectedPartnerId =>
					selectedPartnerId && anniversaryEnabled ? (
						<form.Field name="partnerAnniversary">
							{field => (
								<Field className="gap-1">
									<FieldLabel htmlFor={field.name} className="flex items-center gap-1.5">
										{m.settings_profile_anniversary_label()}
										<InputTooltip>{m.settings_profile_anniversary_tooltip()}</InputTooltip>
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
					<AlertTitle>{m.settings_alert_error_title()}</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			{success && (
				<Alert variant="default">
					<AlertTitle>{m.settings_alert_success_title()}</AlertTitle>
					<AlertDescription>{m.settings_profile_updated_alert()}</AlertDescription>
				</Alert>
			)}
			<Button type="submit" disabled={isLoading}>
				{isLoading ? m.settings_profile_saving() : m.action_save()}
			</Button>

			<AlertDialog
				open={pendingPartnerChange != null}
				onOpenChange={open => {
					if (!open) setPendingPartnerChange(null)
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{pendingPartnerChange?.partnerId ? m.settings_profile_partner_change_title() : m.settings_profile_partner_remove_title()}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{currentPartnerName
								? m.settings_profile_partner_confirm_named({ name: currentPartnerName })
								: m.settings_profile_partner_confirm_unnamed()}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{m.action_cancel()}</AlertDialogCancel>
						<AlertDialogAction
							onClick={async () => {
								const pending = pendingPartnerChange
								setPendingPartnerChange(null)
								if (pending) await onSubmit(pending)
							}}
						>
							{pendingPartnerChange?.partnerId ? m.settings_profile_partner_change_button() : m.settings_profile_partner_remove_button()}
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
						<DialogTitle>{m.settings_profile_editors_dialog_title()}</DialogTitle>
						<DialogDescription>{m.settings_profile_editors_dialog_description()}</DialogDescription>
					</DialogHeader>
					{editorChangePrompt && (
						<div className="space-y-5">
							{editorChangePrompt.toAdd.length > 0 && (
								<section className="space-y-2">
									<h3 className="text-sm font-medium">
										{editorChangePrompt.nextPartnerLabel != null
											? m.settings_profile_editors_add_heading({ name: editorChangePrompt.nextPartnerLabel })
											: m.settings_profile_editors_add_heading_unnamed()}
									</h3>
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
										{editorChangePrompt.prevPartnerLabel != null
											? m.settings_profile_editors_remove_heading({ name: editorChangePrompt.prevPartnerLabel })
											: m.settings_profile_editors_remove_heading_unnamed()}
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
							{m.settings_profile_editors_skip()}
						</Button>
						<Button type="button" onClick={applyEditorChanges} disabled={applyingEditorChanges}>
							{applyingEditorChanges ? m.settings_profile_editors_applying() : m.settings_profile_editors_apply()}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</form>
	)
}
