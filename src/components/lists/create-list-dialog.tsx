import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { ListPlus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { listCustomHolidaysForPicker } from '@/api/custom-holidays'
import { getMyDependents } from '@/api/dependents'
import { addListEditor } from '@/api/list-editors'
import { createList } from '@/api/lists'
import { getGiftIdeasRecipients } from '@/api/user'
import DependentAvatar from '@/components/common/dependent-avatar'
import ListTypeIcon from '@/components/common/list-type-icon'
import { MarkdownTextarea } from '@/components/common/markdown-textarea'
import UserAvatar from '@/components/common/user-avatar'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { listTypeEnumValues } from '@/db/schema/enums'
import { useSession } from '@/lib/auth-client'
import { errorText } from '@/lib/i18n/errors'
import { formatDate } from '@/lib/i18n/format'
import { listTypeLabel } from '@/lib/i18n/labels'
import { zodIssuesText, zodParams } from '@/lib/i18n/zod'
import { LIMITS } from '@/lib/validation/limits'
import { m } from '@/paraglide/messages.js'

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
}

const IS_DEV = import.meta.env.DEV

// Built per submit, not when the module loads, so the message is worded in
// the language of the page showing it.
const buildSchema = () =>
	z.object({
		name: z.string().min(1, m.lists_form_name_required()).max(LIMITS.LIST_NAME),
		type: z.enum(listTypeEnumValues),
		isPrivate: z.boolean(),
		description: z.string().max(LIMITS.MEDIUM_TEXT).optional(),
		giftIdeasTargetUserId: z.string().optional(),
		giftIdeasTargetDependentId: z.string().optional(),
		subjectDependentId: z.string().optional(),
		customHolidayId: z.string().optional(),
		addPartnerAsEditor: z.boolean(),
	})

function formatHolidayDate(d: Date): string {
	return formatDate(d, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function CreateListDialog({ open, onOpenChange }: Props) {
	const router = useRouter()
	const queryClient = useQueryClient()
	const { data: session } = useSession()
	const isChild = session?.user.isChild ?? false
	const partnerId = session?.user.partnerId ?? null
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [selectedType, setSelectedType] = useState('wishlist')

	const { data: users } = useQuery({
		queryKey: ['gift-ideas-recipients'],
		queryFn: () => getGiftIdeasRecipients(),
		enabled: open,
		staleTime: 10 * 60 * 1000,
	})

	const { data: myDependents } = useQuery({
		queryKey: ['dependents', 'mine'],
		queryFn: () => getMyDependents(),
		enabled: open,
		staleTime: 5 * 60 * 1000,
	})

	// Admin-curated custom holidays. Drives the single holiday picker
	// below. Each row pre-resolves its next-occurrence date for display.
	const { data: customHolidays } = useQuery({
		queryKey: ['custom-holidays-for-picker'],
		queryFn: () => listCustomHolidaysForPicker(),
		enabled: open,
		staleTime: 10 * 60 * 1000,
	})

	const partner = partnerId ? users?.find(u => u.id === partnerId) : undefined
	const partnerName = partner ? partner.name || partner.email : null

	const noHolidaysConfigured = customHolidays !== undefined && customHolidays.length === 0
	const availableTypes = (isChild ? listTypeEnumValues.filter(t => t !== 'giftideas') : listTypeEnumValues)
		.filter(t => !(t === 'holiday' && noHolidaysConfigured))
		.filter(t => !(t === 'test' && !IS_DEV))

	const form = useForm({
		defaultValues: {
			name: '',
			type: 'wishlist' as string,
			isPrivate: false,
			description: '',
			giftIdeasTargetUserId: '',
			giftIdeasTargetDependentId: '',
			subjectDependentId: '',
			customHolidayId: '',
			addPartnerAsEditor: true,
		},
		onSubmit: async ({ value }) => {
			const parsed = buildSchema().safeParse(value, zodParams())
			if (!parsed.success) {
				setError(zodIssuesText(parsed.error))
				return
			}

			setSubmitting(true)
			setError(null)
			try {
				const willBePublic = parsed.data.type !== 'giftideas' && !parsed.data.isPrivate
				const shouldAddPartner = willBePublic && !!partnerId && !!partner && parsed.data.addPartnerAsEditor

				// A gift-ideas target can be a user OR a dependent, not both.
				// Pick whichever the form has a value for; the server enforces
				// mutual exclusion in storage.
				const giftIdeasTargetUserId =
					parsed.data.type === 'giftideas' && parsed.data.giftIdeasTargetUserId ? parsed.data.giftIdeasTargetUserId : undefined
				const giftIdeasTargetDependentId =
					parsed.data.type === 'giftideas' && parsed.data.giftIdeasTargetDependentId && !giftIdeasTargetUserId
						? parsed.data.giftIdeasTargetDependentId
						: undefined

				const result = await createList({
					data: {
						name: parsed.data.name,
						type: parsed.data.type,
						isPrivate: parsed.data.type === 'giftideas' ? true : parsed.data.isPrivate,
						description: parsed.data.description?.trim() || undefined,
						giftIdeasTargetUserId,
						giftIdeasTargetDependentId,
						subjectDependentId: parsed.data.subjectDependentId || undefined,
						customHolidayId: parsed.data.type === 'holiday' ? parsed.data.customHolidayId || undefined : undefined,
					},
				})

				if (result.kind === 'error') {
					const message: Record<typeof result.reason, string> = {
						'child-cannot-create-gift-ideas': m.lists_create_error_child_gift_ideas(),
						'not-dependent-guardian': m.lists_form_error_not_guardian(),
						'invalid-holiday-selection': m.lists_create_error_holiday(),
						'list-type-disabled': m.lists_create_error_type_disabled(),
					}
					setError(message[result.reason])
					return
				}

				if (shouldAddPartner && partnerId) {
					const editorResult = await addListEditor({ data: { listId: result.list.id, userId: partnerId } })
					if (editorResult.kind === 'error') {
						toast.warning(
							partnerName ? m.lists_create_partner_failed_named({ name: partnerName }) : m.lists_create_partner_failed_generic()
						)
					}
				}

				toast.success(m.lists_created_toast({ listName: result.list.name }))
				onOpenChange(false)
				form.reset()
				await queryClient.invalidateQueries({ queryKey: ['my-lists'] })
				await router.invalidate()
				router.navigate({
					to: '/lists/$listId/edit',
					params: { listId: String(result.list.id) },
				})
			} catch (err) {
				setError(errorText(err, m.lists_create_failed()))
			} finally {
				setSubmitting(false)
			}
		},
	})

	const isGiftIdeas = selectedType === 'giftideas'
	const isHoliday = selectedType === 'holiday'

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-yellow-500 dark:bg-yellow-600 ring-1 ring-yellow-400/40 dark:ring-yellow-600/40 shadow-sm">
							<ListPlus className="size-5.25 shrink-0 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.4)]" />
						</span>
						{m.lists_create_dialog_title()}
					</DialogTitle>
					<DialogDescription>{m.lists_create_dialog_description()}</DialogDescription>
				</DialogHeader>

				<form
					onSubmit={e => {
						e.preventDefault()
						e.stopPropagation()
						form.handleSubmit()
					}}
					className="space-y-4"
				>
					<form.Field name="name">
						{field => (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>{m.lists_form_name_label()}</Label>
								<Input
									id={field.name}
									name="list-name"
									placeholder={m.lists_create_name_placeholder()}
									value={field.state.value}
									onChange={e => field.handleChange(e.target.value)}
									onBlur={field.handleBlur}
									disabled={submitting}
									autoFocus
									autoComplete="off"
									data-1p-ignore
									data-lpignore="true"
									maxLength={LIMITS.LIST_NAME}
								/>
								{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
									<p className="text-destructive text-sm">
										{field.state.meta.errors.map(e => (typeof e === 'string' ? e : String(e))).join(', ')}
									</p>
								)}
							</div>
						)}
					</form.Field>

					<div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
						<form.Field name="type">
							{field => (
								<div className="grid gap-2">
									<Label htmlFor={field.name}>{m.lists_form_type_label()}</Label>
									<Select
										value={field.state.value}
										onValueChange={v => {
											field.handleChange(v)
											setSelectedType(v)
											if (v === 'giftideas') {
												form.setFieldValue('isPrivate', true)
											}
											if (v === 'holiday' && !form.getFieldValue('customHolidayId')) {
												const first = customHolidays?.[0]?.id
												if (first) form.setFieldValue('customHolidayId', first)
											}
										}}
										disabled={submitting}
									>
										<SelectTrigger id={field.name} className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{availableTypes.map(t => (
												<SelectItem key={t} value={t}>
													<ListTypeIcon type={t} className="size-4" />
													{listTypeLabel(t)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							)}
						</form.Field>

						{!isGiftIdeas && (myDependents?.dependents ?? []).filter(d => !d.isArchived).length > 0 && (
							<form.Field name="subjectDependentId">
								{field => (
									<div className="grid gap-2">
										<Label htmlFor={field.name}>{m.lists_form_subject_label()}</Label>
										<Select
											value={field.state.value || 'me'}
											onValueChange={v => field.handleChange(v === 'me' ? '' : v)}
											disabled={submitting}
										>
											<SelectTrigger id={field.name} className="w-full">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="me">{m.lists_form_subject_me()}</SelectItem>
												{(myDependents?.dependents ?? [])
													.filter(d => !d.isArchived)
													.map(d => (
														<SelectItem key={d.id} value={d.id}>
															<DependentAvatar name={d.name} image={d.image} size="small" />
															<span className="truncate">{d.name}</span>
														</SelectItem>
													))}
											</SelectContent>
										</Select>
									</div>
								)}
							</form.Field>
						)}
					</div>

					{isHoliday && (
						<div className="grid gap-2">
							<form.Field name="customHolidayId">
								{field => (
									<>
										<Label htmlFor={field.name}>{m.lists_form_holiday_label()}</Label>
										<Select value={field.state.value} onValueChange={v => field.handleChange(v)} disabled={submitting}>
											<SelectTrigger id={field.name} className="w-full">
												<SelectValue placeholder={m.lists_form_holiday_placeholder()} />
											</SelectTrigger>
											<SelectContent>
												{(customHolidays ?? []).map(h => (
													<SelectItem key={h.id} value={h.id}>
														{h.nextOccurrenceIso
															? m.lists_form_holiday_option_dated({
																	title: h.title,
																	date: formatHolidayDate(new Date(h.nextOccurrenceIso)),
																})
															: h.title}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</>
								)}
							</form.Field>
						</div>
					)}

					{isGiftIdeas && (
						<div className="grid gap-2">
							<Label>{m.lists_form_gift_ideas_for_label()}</Label>
							<form.Field name="giftIdeasTargetUserId">
								{userField => (
									<form.Field name="giftIdeasTargetDependentId">
										{depField => {
											// Combined value: prefix with "u:" or "d:" so a single
											// Select can carry either kind. Empty string means no target.
											const combined = userField.state.value
												? `u:${userField.state.value}`
												: depField.state.value
													? `d:${depField.state.value}`
													: ''
											return (
												<Select
													value={combined}
													onValueChange={v => {
														if (!v) {
															userField.handleChange('')
															depField.handleChange('')
															return
														}
														if (v.startsWith('u:')) {
															userField.handleChange(v.slice(2))
															depField.handleChange('')
														} else if (v.startsWith('d:')) {
															userField.handleChange('')
															depField.handleChange(v.slice(2))
														}
													}}
													disabled={submitting}
												>
													<SelectTrigger>
														<SelectValue placeholder={m.lists_form_person_placeholder()} />
													</SelectTrigger>
													<SelectContent>
														{users?.map(u => (
															<SelectItem key={`u:${u.id}`} value={`u:${u.id}`}>
																<UserAvatar name={u.name || u.email} image={u.image} size="small" />
																<span className="truncate">{u.name || u.email}</span>
															</SelectItem>
														))}
														{(myDependents?.dependents ?? [])
															.filter(d => !d.isArchived)
															.map(d => (
																<SelectItem key={`d:${d.id}`} value={`d:${d.id}`}>
																	<DependentAvatar name={d.name} image={d.image} size="small" />
																	<span className="truncate">{d.name}</span>
																</SelectItem>
															))}
													</SelectContent>
												</Select>
											)
										}}
									</form.Field>
								)}
							</form.Field>
						</div>
					)}

					<form.Field name="isPrivate">
						{field => (
							<div className="flex items-center justify-between gap-3">
								<Label htmlFor={field.name} className="font-normal">
									{isGiftIdeas ? m.lists_form_private_label_gift_ideas() : m.lists_form_private_label()}
								</Label>
								<Switch
									id={field.name}
									checked={isGiftIdeas ? true : field.state.value}
									onCheckedChange={v => field.handleChange(v === true)}
									disabled={submitting || isGiftIdeas}
								/>
							</div>
						)}
					</form.Field>

					<form.Subscribe selector={s => s.values.isPrivate}>
						{isPrivate => {
							const willBePublic = !isGiftIdeas && !isPrivate
							if (!willBePublic || !partnerId || !partner) return null
							return (
								<form.Field name="addPartnerAsEditor">
									{field => (
										<div className="bg-muted/40 flex items-start gap-2 rounded-md border p-3">
											<Checkbox
												id={field.name}
												checked={field.state.value}
												onCheckedChange={v => field.handleChange(v === true)}
												disabled={submitting}
												className="mt-0.5"
											/>
											<div className="grid gap-1">
												<Label htmlFor={field.name} className="font-normal">
													{partnerName
														? m.lists_form_add_partner_label_named({ name: partnerName })
														: m.lists_form_add_partner_label_generic()}
												</Label>
												<p className="text-muted-foreground text-xs">{m.lists_create_add_partner_help()}</p>
											</div>
										</div>
									)}
								</form.Field>
							)
						}}
					</form.Subscribe>

					<form.Field name="description">
						{field => (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>{m.lists_form_description_label()}</Label>
								<MarkdownTextarea
									id={field.name}
									placeholder={m.lists_create_description_placeholder()}
									rows={2}
									value={field.state.value}
									onChange={v => field.handleChange(v)}
									onBlur={field.handleBlur}
									disabled={submitting}
									maxLength={LIMITS.MEDIUM_TEXT}
								/>
							</div>
						)}
					</form.Field>

					{error && (
						<Alert variant="destructive">
							<AlertTitle>{m.lists_create_error_title()}</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
							{m.action_cancel()}
						</Button>
						<Button type="submit" disabled={submitting}>
							{submitting ? m.lists_create_busy() : m.lists_create_submit()}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
