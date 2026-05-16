import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { Archive } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { listCustomHolidaysForPicker } from '@/api/custom-holidays'
import { getMyDependents } from '@/api/dependents'
import { archiveListPurchases } from '@/api/items'
import { getListChangeImpactInputs } from '@/api/list-change-impact'
import { addListEditor } from '@/api/list-editors'
import { updateList } from '@/api/lists'
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
import { listTypeEnumValues, ListTypes } from '@/db/schema/enums'
import { useSession } from '@/lib/auth-client'
import { evaluateListChangeImpact } from '@/lib/list-change-impact'
import { itemsKeys } from '@/lib/queries/items'
import { LIMITS } from '@/lib/validation/limits'

const IS_DEV = import.meta.env.DEV

const schema = z.object({
	name: z.string().min(1, 'Name is required').max(LIMITS.LIST_NAME),
	type: z.enum(listTypeEnumValues),
	isPrivate: z.boolean(),
	description: z.string().max(LIMITS.MEDIUM_TEXT).optional(),
	giftIdeasTargetUserId: z.string().optional(),
	subjectDependentId: z.string().optional(),
	customHolidayId: z.string().optional(),
	addPartnerAsEditor: z.boolean(),
})

function formatHolidayDate(d: Date): string {
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
}: Props) {
	const router = useRouter()
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
	const partnerLabel = partner ? partner.name || partner.email : 'your partner'

	const [archivePurchasesOpen, setArchivePurchasesOpen] = useState(false)

	const handleArchivePurchases = async () => {
		const result = await archiveListPurchases({ data: { listId } })
		if (result.kind === 'error') {
			toast.error("You don't have permission to archive purchases on this list.")
			return
		}
		if (result.updated === 0) {
			toast.info('No claimed items to archive.')
		} else {
			toast.success(`Archived ${result.updated} claimed ${result.updated === 1 ? 'item' : 'items'}.`)
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
			const parsed = schema.safeParse(value)
			if (!parsed.success) {
				setError(parsed.error.issues.map(e => e.message).join(', '))
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
					if (result.reason === 'not-authorized') setError("You don't have permission to change this list's settings.")
					else if (result.reason === 'child-cannot-create-gift-ideas') setError("Children can't switch a list to gift-ideas.")
					else if (result.reason === 'not-dependent-guardian') setError("You're not a guardian of that dependent.")
					else if (result.reason === 'invalid-holiday-selection') setError('Pick a country and holiday for this list.')
					else setError('List not found.')
					return
				}

				if (shouldAddPartner && partnerId) {
					const editorResult = await addListEditor({ data: { listId, userId: partnerId } })
					if (editorResult.kind === 'error') {
						toast.warning(`Settings saved, but couldn't add ${partnerLabel} as an editor.`)
					}
				}

				toast.success('List settings saved')
				await queryClient.invalidateQueries({ queryKey: ['my-lists'] })
				await router.invalidate()
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to save settings')
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
						<Label htmlFor={field.name}>Name</Label>
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
						<Label htmlFor={field.name}>Type</Label>
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
											{ListTypes[t]}
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
						const recipientLabel = recipient ? recipient.name || recipient.email : 'this person'
						return (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>Gift ideas for (optional)</Label>
								<Select
									value={field.state.value || NO_RECIPIENT}
									onValueChange={v => field.handleChange(v === NO_RECIPIENT ? '' : v)}
									disabled={submitting}
								>
									<SelectTrigger id={field.name}>
										<SelectValue placeholder="Select a person" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={NO_RECIPIENT}>No recipient</SelectItem>
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
										<AlertTitle>Recipient is also an editor</AlertTitle>
										<AlertDescription>
											{recipientLabel} is listed as an editor and will be able to see this list. Remove them as an editor to keep gift ideas
											a surprise.
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
							<Label htmlFor={field.name}>List is for (optional)</Label>
							<Select value={field.state.value || 'me'} onValueChange={v => field.handleChange(v === 'me' ? '' : v)} disabled={submitting}>
								<SelectTrigger id={field.name}>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="me">Me</SelectItem>
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
								<Label htmlFor={field.name}>Holiday</Label>
								<Select
									value={field.state.value}
									onValueChange={v => {
										field.handleChange(v)
										setSelectedCustomHolidayId(v || null)
									}}
									disabled={submitting}
								>
									<SelectTrigger id={field.name}>
										<SelectValue placeholder="Select a holiday" />
									</SelectTrigger>
									<SelectContent>
										{(customHolidays ?? []).map(h => (
											<SelectItem key={h.id} value={h.id}>
												{h.title}
												{h.nextOccurrenceIso ? ` (${formatHolidayDate(new Date(h.nextOccurrenceIso))})` : ''}
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
							Private list {isGiftIdeas && '(always private for Gift Ideas)'}
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
											Add {partnerLabel} as an editor
										</Label>
										<p className="text-muted-foreground text-xs">
											You're making this list public. Add your partner so they can manage items too. You can always change this later.
										</p>
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
						<Label htmlFor={field.name}>Description (optional)</Label>
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
					<AlertTitle>Error</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<ListChangeImpactWarnings warnings={changeImpact.warnings} />

			<Button type="submit" disabled={submitting}>
				{submitting ? 'Saving…' : 'Save settings'}
			</Button>

			{isOwner && type !== 'todos' && (
				<>
					<Separator />
					<div className="grid gap-2">
						<Label>Archive claimed items</Label>
						<p className="text-muted-foreground text-xs">
							Mark every claimed item on this list as archived. Archived items reveal who claimed them on your Received Gifts page, so only
							do this once you've received the gifts.
						</p>
						<Button type="button" variant="outline" onClick={() => setArchivePurchasesOpen(true)} className="w-fit">
							<Archive className="size-4" />
							Archive all purchases
						</Button>
					</div>
					<ConfirmDialog
						open={archivePurchasesOpen}
						onOpenChange={setArchivePurchasesOpen}
						title="Archive all purchases on this list?"
						description={
							<>
								This will archive every item on this list that has been claimed. Archived items move out of the active list and the people
								who claimed them will be revealed to you on your Received Gifts page.
								<br />
								<br />
								Only do this once you've received the gifts. This can't be undone in bulk.
							</>
						}
						confirmLabel="Archive purchases"
						confirmBusyLabel="Archiving…"
						destructive
						onConfirm={handleArchivePurchases}
					/>
				</>
			)}
		</form>
	)
}
