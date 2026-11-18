import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { Archive, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { listCustomHolidaysForPicker } from '@/api/custom-holidays'
import { getMyDependents } from '@/api/dependents'
import { archiveListPurchases } from '@/api/items'
import { getListChangeImpactInputs } from '@/api/list-change-impact'
import { addListEditor } from '@/api/list-editors'
import { deleteList, updateList } from '@/api/lists'
import { getGiftIdeasRecipients } from '@/api/user'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import DependentAvatar from '@/components/common/dependent-avatar'
import ListTypeIcon from '@/components/common/list-type-icon'
import { MarkdownTextarea } from '@/components/common/markdown-textarea'
import UserAvatar from '@/components/common/user-avatar'
import { ListChangeImpactWarnings } from '@/components/lists/list-change-impact-warnings'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import type { ListType } from '@/db/schema/enums'
import { listTypeEnumValues } from '@/db/schema/enums'
import { useSession } from '@/lib/auth-client'
import { errorText } from '@/lib/i18n/errors'
import { formatDate } from '@/lib/i18n/format'
import { listTypeLabel } from '@/lib/i18n/labels'
import { zodIssuesText, zodParams } from '@/lib/i18n/zod'
import { evaluateListChangeImpact } from '@/lib/list-change-impact'
import { itemsKeys } from '@/lib/queries/items'
import { LIMITS } from '@/lib/validation/limits'
import { m } from '@/paraglide/messages.js'

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
		subjectDependentId: z.string().optional(),
		customHolidayId: z.string().optional(),
		addPartnerAsEditor: z.boolean(),
	})

function formatHolidayDate(d: Date): string {
	return formatDate(d, { month: 'short', day: 'numeric', year: 'numeric' })
}

const NO_RECIPIENT = '__none__'

type Props = {
	listId: number
	name: string
	type: ListType
	isPrivate: boolean
	description: string | null
	giftIdeasTargetUserId: string | null
	subjectDependentId: string | null
	customHolidayId: string | null
	editorUserIds: Array<string>
	isOwner: boolean
	// True when this list auto-archives. When true the contextual reveal
	// controls on the edit-view banner own the reveal flow, so the manual
	// "Archive all purchases" button below is retired.
	archiveApplies: boolean
	lastArchivedAt: string | null
}

export function ListSettingsForm({
	listId,
	name,
	type,
	isPrivate,
	description,
	giftIdeasTargetUserId,
	subjectDependentId,
	customHolidayId,
	editorUserIds,
	isOwner,
	archiveApplies,
	lastArchivedAt,
}: Props) {
	const router = useRouter()
	const navigate = useNavigate()
	const queryClient = useQueryClient()
	const { data: session } = useSession()
	const partnerId = isOwner ? (session?.user.partnerId ?? null) : null
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [selectedType, setSelectedType] = useState<string>(type)

	const isGiftIdeas = selectedType === 'giftideas'
	const isHoliday = selectedType === 'holiday'
	const partnerAlreadyEditor = !!partnerId && editorUserIds.includes(partnerId)
	const [selectedCustomHolidayId, setSelectedCustomHolidayId] = useState<string | null>(customHolidayId ?? null)

	const { data: users } = useQuery({
		queryKey: ['gift-ideas-recipients'],
		queryFn: () => getGiftIdeasRecipients(),
		enabled: isGiftIdeas || (!!partnerId && !partnerAlreadyEditor),
		staleTime: 10 * 60 * 1000,
	})

	const { data: myDependents } = useQuery({
		queryKey: ['dependents', 'mine'],
		queryFn: () => getMyDependents(),
		enabled: isOwner && !isGiftIdeas,
		staleTime: 5 * 60 * 1000,
	})

	const activeDependents = (myDependents?.dependents ?? []).filter(d => !d.isArchived)

	const { data: customHolidays } = useQuery({
		queryKey: ['custom-holidays-for-picker'],
		queryFn: () => listCustomHolidaysForPicker(),
		enabled: isHoliday,
		staleTime: 10 * 60 * 1000,
	})

	// Calendar-proximity warnings: never reveal claim state. Only the
	// owner sees these warnings (server fn refuses non-owner requests).
	const { data: changeImpactInputs } = useQuery({
		queryKey: ['list-change-impact-inputs', listId],
		queryFn: () => getListChangeImpactInputs({ data: { listId } }),
		enabled: isOwner,
		staleTime: 30_000,
	})

	const proposedType = selectedType as ListType
	const proposedCustomHolidayId = proposedType === 'holiday' ? selectedCustomHolidayId : null
	const changeImpact = changeImpactInputs
		? evaluateListChangeImpact({
				list: {
					id: listId,
					type,
					customHolidayId: customHolidayId ?? null,
					isActive: true,
				},
				proposed: {
					type: proposedType,
					customHolidayId: proposedCustomHolidayId,
				},
				inWindowEvents: changeImpactInputs.inWindowEvents,
				otherSubjectLists: changeImpactInputs.otherSubjectLists,
			})
		: { warnings: [] }

	const partner = partnerId ? users?.find(u => u.id === partnerId) : undefined
	const partnerName = partner ? partner.name || partner.email : null

	const [archivePurchasesOpen, setArchivePurchasesOpen] = useState(false)
	const [deleteListOpen, setDeleteListOpen] = useState(false)

	const handleDeleteList = async () => {
		const result = await deleteList({ data: { listId } })
		if (result.kind === 'error') {
			toast.error(result.reason === 'not-owner' ? m.lists_settings_delete_not_owner() : m.lists_settings_error_not_found())
			return
		}
		await queryClient.invalidateQueries({ queryKey: ['my-lists'] })
		if (result.action === 'archived') {
			toast.info(m.lists_delete_archived_instead({ listName: name }))
			await router.invalidate()
		} else {
			toast.success(m.lists_deleted({ listName: name }))
			await navigate({ to: '/me' })
		}
	}

	const handleArchivePurchases = async () => {
		const result = await archiveListPurchases({ data: { listId } })
		if (result.kind === 'error') {
			toast.error(m.lists_archive_purchases_not_allowed())
			return
		}
		const total = result.updated + result.addonsArchived
		if (total === 0) {
			toast.info(m.lists_archive_purchases_none())
		} else {
			if (result.updated > 0 && result.addonsArchived > 0) {
				toast.success(m.lists_archive_purchases_done_both({ itemCount: result.updated, addonCount: result.addonsArchived }))
			} else if (result.updated > 0) {
				toast.success(m.lists_archive_purchases_done_items({ count: result.updated }))
			} else {
				toast.success(m.lists_archive_purchases_done_addons({ count: result.addonsArchived }))
			}
		}
		await Promise.all([queryClient.invalidateQueries({ queryKey: itemsKeys.byList(listId) }), router.invalidate()])
	}

	const form = useForm({
		defaultValues: {
			name,
			type: type as string,
			isPrivate,
			description: description ?? '',
			giftIdeasTargetUserId: giftIdeasTargetUserId ?? '',
			subjectDependentId: subjectDependentId ?? '',
			customHolidayId: customHolidayId ?? '',
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
				const nextType = parsed.data.type
				const willBePublic = nextType !== 'giftideas' && !parsed.data.isPrivate
				const becomingPublic = isPrivate && willBePublic
				const shouldAddPartner =
					becomingPublic && isOwner && !!partnerId && !partnerAlreadyEditor && !!partner && parsed.data.addPartnerAsEditor

				const result = await updateList({
					data: {
						listId,
						name: parsed.data.name.trim(),
						type: nextType,
						isPrivate: nextType === 'giftideas' ? true : parsed.data.isPrivate,
						description: parsed.data.description?.trim() || null,
						giftIdeasTargetUserId: nextType === 'giftideas' ? parsed.data.giftIdeasTargetUserId || null : null,
						subjectDependentId: isOwner && nextType !== 'giftideas' ? parsed.data.subjectDependentId || null : undefined,
						customHolidayId: nextType === 'holiday' ? parsed.data.customHolidayId || null : null,
					},
				})

				if (result.kind === 'error') {
					if (result.reason === 'not-authorized') setError(m.lists_settings_error_not_authorized())
					else if (result.reason === 'child-cannot-create-gift-ideas') setError(m.lists_settings_error_child_gift_ideas())
					else if (result.reason === 'not-dependent-guardian') setError(m.lists_form_error_not_guardian())
					else if (result.reason === 'invalid-holiday-selection') setError(m.lists_settings_error_holiday())
					else setError(m.lists_settings_error_not_found())
					return
				}

				if (shouldAddPartner && partnerId) {
					const editorResult = await addListEditor({ data: { listId, userId: partnerId } })
					if (editorResult.kind === 'error') {
						toast.warning(
							partnerName ? m.lists_settings_partner_failed_named({ name: partnerName }) : m.lists_settings_partner_failed_generic()
						)
					}
				}

				toast.success(m.lists_settings_saved())
				await queryClient.invalidateQueries({ queryKey: ['my-lists'] })
				await router.invalidate()
			} catch (err) {
				setError(errorText(err, m.lists_settings_save_failed()))
			} finally {
				setSubmitting(false)
			}
		},
	})

	return (
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
							value={field.state.value}
							onChange={e => field.handleChange(e.target.value)}
							disabled={submitting}
							autoComplete="off"
							data-1p-ignore
							data-lpignore="true"
							maxLength={LIMITS.LIST_NAME}
						/>
					</div>
				)}
			</form.Field>

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
							}}
							disabled={submitting}
						>
							<SelectTrigger id={field.name}>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{listTypeEnumValues
									.filter(t => !(t === 'test' && !IS_DEV))
									.filter(t => (type === 'todos' ? t === 'todos' : t !== 'todos'))
									.map(t => (
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

			{isGiftIdeas && isOwner && (
				<form.Field name="giftIdeasTargetUserId">
					{field => {
						const recipientId = field.state.value
						const recipientIsEditor = !!recipientId && editorUserIds.includes(recipientId)
						const recipient = recipientIsEditor ? users?.find(u => u.id === recipientId) : undefined
						const recipientName = recipient ? recipient.name || recipient.email : null
						return (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>{m.lists_form_gift_ideas_for_label()}</Label>
								<Select
									value={field.state.value || NO_RECIPIENT}
									onValueChange={v => field.handleChange(v === NO_RECIPIENT ? '' : v)}
									disabled={submitting}
								>
									<SelectTrigger id={field.name}>
										<SelectValue placeholder={m.lists_form_person_placeholder()} />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={NO_RECIPIENT}>{m.lists_settings_no_recipient()}</SelectItem>
										{users?.map(u => (
											<SelectItem key={u.id} value={u.id}>
												<UserAvatar name={u.name || u.email} image={u.image} size="small" />
												<span className="truncate">{u.name || u.email}</span>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{recipientIsEditor && (
									<Alert variant="warning">
										<AlertTitle>{m.lists_settings_recipient_editor_title()}</AlertTitle>
										<AlertDescription>
											{recipientName
												? m.lists_settings_recipient_editor_body_named({ name: recipientName })
												: m.lists_settings_recipient_editor_body_generic()}
										</AlertDescription>
									</Alert>
								)}
							</div>
						)
					}}
				</form.Field>
			)}

			{!isGiftIdeas && isOwner && activeDependents.length > 0 && (
				<form.Field name="subjectDependentId">
					{field => (
						<div className="grid gap-2">
							<Label htmlFor={field.name}>{m.lists_form_subject_label()}</Label>
							<Select value={field.state.value || 'me'} onValueChange={v => field.handleChange(v === 'me' ? '' : v)} disabled={submitting}>
								<SelectTrigger id={field.name}>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="me">{m.lists_form_subject_me()}</SelectItem>
									{activeDependents.map(d => (
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

			{isHoliday && (
				<div className="grid gap-2">
					<form.Field name="customHolidayId">
						{field => (
							<>
								<Label htmlFor={field.name}>{m.lists_form_holiday_label()}</Label>
								<Select
									value={field.state.value}
									onValueChange={v => {
										field.handleChange(v)
										setSelectedCustomHolidayId(v || null)
									}}
									disabled={submitting}
								>
									<SelectTrigger id={field.name}>
										<SelectValue placeholder={m.lists_form_holiday_placeholder()} />
									</SelectTrigger>
									<SelectContent>
										{(customHolidays ?? []).map(h => (
											<SelectItem key={h.id} value={h.id}>
												{h.nextOccurrenceIso
													? m.lists_form_holiday_option_dated({ title: h.title, date: formatHolidayDate(new Date(h.nextOccurrenceIso)) })
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

			<form.Field name="isPrivate">
				{field => (
					<div className="flex items-center gap-2">
						<Checkbox
							id={field.name}
							checked={isGiftIdeas ? true : field.state.value}
							onCheckedChange={v => field.handleChange(v === true)}
							disabled={submitting || isGiftIdeas}
						/>
						<Label htmlFor={field.name} className="font-normal">
							{isGiftIdeas ? m.lists_form_private_label_gift_ideas() : m.lists_form_private_label()}
						</Label>
					</div>
				)}
			</form.Field>

			<form.Subscribe selector={s => s.values.isPrivate}>
				{nextIsPrivate => {
					const willBePublic = !isGiftIdeas && !nextIsPrivate
					const becomingPublic = isPrivate && willBePublic
					if (!becomingPublic || !isOwner || !partnerId || partnerAlreadyEditor || !partner) return null
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
											{partnerName ? m.lists_form_add_partner_label_named({ name: partnerName }) : m.lists_form_add_partner_label_generic()}
										</Label>
										<p className="text-muted-foreground text-xs">{m.lists_settings_add_partner_help()}</p>
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
							rows={2}
							value={field.state.value}
							onChange={v => field.handleChange(v)}
							disabled={submitting}
							maxLength={LIMITS.MEDIUM_TEXT}
						/>
					</div>
				)}
			</form.Field>

			{error && (
				<Alert variant="destructive">
					<AlertTitle>{m.lists_settings_error_title()}</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<ListChangeImpactWarnings warnings={changeImpact.warnings} />

			<Button type="submit" disabled={submitting}>
				{submitting ? m.state_saving() : m.lists_settings_submit()}
			</Button>

			{isOwner && (
				<>
					<Separator />
					<div className="grid gap-2">
						<Label>{m.lists_settings_delete_heading()}</Label>
						<p className="text-muted-foreground text-xs">{m.lists_settings_delete_help()}</p>
						<Button
							type="button"
							variant="outline"
							onClick={() => setDeleteListOpen(true)}
							className="w-fit text-destructive hover:text-destructive"
						>
							<Trash2 className="size-4" />
							{m.lists_settings_delete_button()}
						</Button>
					</div>
					<ConfirmDialog
						open={deleteListOpen}
						onOpenChange={setDeleteListOpen}
						title={m.lists_delete_confirm_title({ listName: name })}
						description={m.lists_delete_confirm_description()}
						confirmLabel={m.action_delete()}
						confirmBusyLabel={m.lists_settings_delete_busy()}
						destructive
						onConfirm={handleDeleteList}
					/>
				</>
			)}

			{isOwner && type !== 'todos' && archiveApplies && (
				<>
					<Separator />
					<div className="grid gap-1">
						<Label>{m.lists_settings_last_archived_label()}</Label>
						<p className="text-muted-foreground text-xs">
							{lastArchivedAt
								? m.lists_settings_last_revealed_on({
										date: formatDate(lastArchivedAt, { month: 'long', day: 'numeric', year: 'numeric' }),
									})
								: m.lists_settings_never_revealed()}
						</p>
					</div>
				</>
			)}

			{isOwner && type !== 'todos' && !archiveApplies && (
				<>
					<Separator />
					<div className="grid gap-2">
						<Label>{m.lists_settings_archive_heading()}</Label>
						<p className="text-muted-foreground text-xs">{m.lists_settings_archive_help()}</p>
						<Button type="button" variant="outline" onClick={() => setArchivePurchasesOpen(true)} className="w-fit">
							<Archive className="size-4" />
							{m.lists_settings_archive_button()}
						</Button>
					</div>
					<ConfirmDialog
						open={archivePurchasesOpen}
						onOpenChange={setArchivePurchasesOpen}
						title={m.lists_settings_archive_confirm_title()}
						description={
							<>
								{m.lists_settings_archive_confirm_body()}
								<br />
								<br />
								{m.lists_settings_archive_confirm_warning()}
							</>
						}
						confirmLabel={m.lists_settings_archive_confirm_label()}
						confirmBusyLabel={m.lists_settings_archive_busy()}
						destructive
						onConfirm={handleArchivePurchases}
					/>
				</>
			)}
		</form>
	)
}
