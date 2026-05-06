import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { ListPlus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { getMyDependents } from '@/api/dependents'
import { addListEditor } from '@/api/list-editors'
import { createList, getMyLastHolidayCountry } from '@/api/lists'
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
import { listTypeEnumValues, ListTypes } from '@/db/schema/enums'
import { useSession } from '@/lib/auth-client'
import { isCountryCode, listCountries, listHolidaysFor } from '@/lib/holidays'
import { LIMITS } from '@/lib/validation/limits'

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
}

const schema = z.object({
	name: z.string().min(1, 'Name is required').max(LIMITS.LIST_NAME),
	type: z.enum(listTypeEnumValues),
	isPrivate: z.boolean(),
	description: z.string().max(LIMITS.MEDIUM_TEXT).optional(),
	giftIdeasTargetUserId: z.string().optional(),
	giftIdeasTargetDependentId: z.string().optional(),
	subjectDependentId: z.string().optional(),
	holidayCountry: z.string().optional(),
	holidayKey: z.string().optional(),
	addPartnerAsEditor: z.boolean(),
})

function formatHolidayDate(d: Date): string {
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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

	// Default the holiday country picker to the user's most recently
	// used country (US fallback). Cheap server fn; only fires when the
	// dialog is open.
	const { data: lastHolidayCountry } = useQuery({
		queryKey: ['my-last-holiday-country'],
		queryFn: () => getMyLastHolidayCountry(),
		enabled: open,
		staleTime: 10 * 60 * 1000,
	})

	const partner = partnerId ? users?.find(u => u.id === partnerId) : undefined
	const partnerLabel = partner ? partner.name || partner.email : 'your partner'

	const availableTypes = isChild ? listTypeEnumValues.filter(t => t !== 'giftideas') : listTypeEnumValues

	const form = useForm({
		defaultValues: {
			name: '',
			type: 'wishlist' as string,
			isPrivate: false,
			description: '',
			giftIdeasTargetUserId: '',
			giftIdeasTargetDependentId: '',
			subjectDependentId: '',
			holidayCountry: '',
			holidayKey: '',
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
						holidayCountry: parsed.data.type === 'holiday' ? parsed.data.holidayCountry || undefined : undefined,
						holidayKey: parsed.data.type === 'holiday' ? parsed.data.holidayKey || undefined : undefined,
					},
				})

				if (result.kind === 'error') {
					const message: Record<typeof result.reason, string> = {
						'child-cannot-create-gift-ideas': "Children can't create gift-ideas lists.",
						'not-dependent-guardian': "You're not a guardian of that dependent.",
						'invalid-holiday-selection': 'Please pick a country and holiday for this list.',
					}
					setError(message[result.reason])
					return
				}

				if (shouldAddPartner && partnerId) {
					const editorResult = await addListEditor({ data: { listId: result.list.id, userId: partnerId } })
					if (editorResult.kind === 'error') {
						toast.warning(`List created, but couldn't add ${partnerLabel} as an editor.`)
					}
				}

				toast.success(`List "${result.list.name}" created`)
				onOpenChange(false)
				form.reset()
				await queryClient.invalidateQueries({ queryKey: ['my-lists'] })
				await router.invalidate()
				router.navigate({
					to: '/lists/$listId/edit',
					params: { listId: String(result.list.id) },
				})
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to create list')
			} finally {
				setSubmitting(false)
			}
		},
	})

	const isGiftIdeas = selectedType === 'giftideas'
	const isHoliday = selectedType === 'holiday'

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-yellow-500 dark:bg-yellow-600 ring-1 ring-yellow-400/40 dark:ring-yellow-600/40 shadow-sm">
							<ListPlus className="size-[21px] shrink-0 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.4)]" />
						</span>
						Create a list
					</DialogTitle>
					<DialogDescription>Choose a name and type for your list. You can change these later.</DialogDescription>
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
								<Label htmlFor={field.name}>Name</Label>
								<Input
									id={field.name}
									name="list-name"
									placeholder="e.g. Christmas 2026"
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

					<div className="grid gap-4 sm:grid-cols-2">
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
											if (v === 'holiday' && !form.getFieldValue('holidayCountry')) {
												const country = lastHolidayCountry && isCountryCode(lastHolidayCountry) ? lastHolidayCountry : 'US'
												form.setFieldValue('holidayCountry', country)
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
													{ListTypes[t]}
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
										<Label htmlFor={field.name}>List is for (optional)</Label>
										<Select
											value={field.state.value || 'me'}
											onValueChange={v => field.handleChange(v === 'me' ? '' : v)}
											disabled={submitting}
										>
											<SelectTrigger id={field.name} className="w-full">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="me">Me</SelectItem>
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
						<div className="grid gap-4 sm:grid-cols-2">
							<form.Field name="holidayCountry">
								{field => (
									<div className="grid gap-2">
										<Label htmlFor={field.name}>Country</Label>
										<Select
											value={field.state.value}
											onValueChange={v => {
												field.handleChange(v)
												// Clear the holiday key when the country changes:
												// rules and slugs differ across countries.
												form.setFieldValue('holidayKey', '')
											}}
											disabled={submitting}
										>
											<SelectTrigger id={field.name} className="w-full">
												<SelectValue placeholder="Select a country" />
											</SelectTrigger>
											<SelectContent>
												{listCountries().map(c => (
													<SelectItem key={c.code} value={c.code}>
														{c.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}
							</form.Field>

							<form.Subscribe selector={s => s.values.holidayCountry}>
								{country => (
									<form.Field name="holidayKey">
										{field => {
											const options = country ? listHolidaysFor(country) : []
											return (
												<div className="grid gap-2">
													<Label htmlFor={field.name}>Holiday</Label>
													<Select value={field.state.value} onValueChange={v => field.handleChange(v)} disabled={submitting || !country}>
														<SelectTrigger id={field.name} className="w-full">
															<SelectValue placeholder={country ? 'Select a holiday' : 'Pick a country first'} />
														</SelectTrigger>
														<SelectContent>
															{options.map(h => (
																<SelectItem key={h.key} value={h.key}>
																	{h.name} ({formatHolidayDate(h.start)})
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>
											)
										}}
									</form.Field>
								)}
							</form.Subscribe>
						</div>
					)}

					{isGiftIdeas && (
						<div className="grid gap-2">
							<Label>Gift ideas for (optional)</Label>
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
														<SelectValue placeholder="Select a person" />
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
									Private list {isGiftIdeas && '(always private for Gift Ideas)'}
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
													Add {partnerLabel} as an editor
												</Label>
												<p className="text-muted-foreground text-xs">
													They'll be able to manage items on this list. You can change this anytime in list settings.
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
									placeholder="A short description of this list"
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
							<AlertTitle>Couldn't create list</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
							Cancel
						</Button>
						<Button type="submit" disabled={submitting}>
							{submitting ? 'Creating…' : 'Create list'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
