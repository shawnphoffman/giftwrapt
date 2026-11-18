import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { moveItemsToList } from '@/api/items'
import { createList, getMyLists } from '@/api/lists'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { type ListType, listTypeEnumValues } from '@/db/schema/enums'
import { errorText } from '@/lib/i18n/errors'
import { listTypeLabel } from '@/lib/i18n/labels'
import { itemsKeys } from '@/lib/queries/items'
import { m } from '@/paraglide/messages.js'

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	itemIds: Array<number>
	sourceListId: number
	onMoved?: () => void
}

const NEW_LIST_VALUE = '__new__'

export function BulkMoveItemsDialog({ open, onOpenChange, itemIds, sourceListId, onMoved }: Props) {
	const router = useRouter()
	const qc = useQueryClient()
	const [selectedListId, setSelectedListId] = useState<string>('')
	const [purgeComments, setPurgeComments] = useState(true)
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const [newListName, setNewListName] = useState('')
	const [newListType, setNewListType] = useState<ListType>('wishlist')
	const [newListPrivate, setNewListPrivate] = useState(false)

	const { data: myLists } = useQuery({
		queryKey: ['my-lists-for-bulk-move'],
		queryFn: () => getMyLists(),
		enabled: open,
	})

	const publicLists = myLists?.public.filter(l => l.id !== sourceListId) ?? []
	const privateLists = myLists?.private.filter(l => l.id !== sourceListId) ?? []
	const giftIdeasLists = myLists?.giftIdeas.filter(l => l.id !== sourceListId) ?? []
	const dependentGroups = (myLists?.dependents ?? [])
		.map(d => ({ ...d, lists: d.lists.filter(l => l.id !== sourceListId) }))
		.filter(d => d.lists.length > 0)

	const creatingNew = selectedListId === NEW_LIST_VALUE
	const isGiftIdeas = newListType === 'giftideas'

	const handleMove = async () => {
		setSubmitting(true)
		setError(null)
		try {
			let targetId: number
			if (creatingNew) {
				if (!newListName.trim()) {
					setError(m.items_bulk_move_error_name_required())
					setSubmitting(false)
					return
				}
				if (isGiftIdeas) {
					setError(m.items_bulk_move_error_gift_ideas())
					setSubmitting(false)
					return
				}
				const created = await createList({
					data: {
						name: newListName.trim(),
						type: newListType,
						isPrivate: newListPrivate,
					},
				})
				if (created.kind === 'error') {
					const message: Record<typeof created.reason, string> = {
						'child-cannot-create-gift-ideas': m.items_bulk_move_error_child_gift_ideas(),
						'not-dependent-guardian': m.items_bulk_move_error_not_guardian(),
						'invalid-holiday-selection': m.items_bulk_move_error_holiday(),
						'list-type-disabled': m.items_bulk_move_error_type_disabled(),
					}
					setError(message[created.reason])
					return
				}
				await qc.invalidateQueries({ queryKey: ['my-lists-for-bulk-move'] })
				targetId = created.list.id
			} else {
				const parsed = Number(selectedListId)
				if (!parsed) {
					setSubmitting(false)
					return
				}
				targetId = parsed
			}

			const result = await moveItemsToList({
				data: { itemIds, targetListId: targetId, purgeComments },
			})
			if (result.kind === 'error') {
				setError(result.reason === 'not-authorized' ? m.items_move_error_not_authorized() : m.items_bulk_move_error_failed_generic())
				return
			}

			const msgs: Array<string> = [m.items_bulk_move_toast_moved({ count: result.moved })]
			if (result.claimsCleared > 0) msgs.push(m.items_bulk_move_toast_claims_cleared({ count: result.claimsCleared }))
			if (result.commentsDeleted > 0) msgs.push(m.items_move_toast_comments_deleted({ count: result.commentsDeleted }))
			toast.success(msgs.join(' · '))

			onOpenChange(false)
			onMoved?.()
			await Promise.all([
				router.invalidate(),
				qc.invalidateQueries({ queryKey: itemsKeys.byList(sourceListId) }),
				qc.invalidateQueries({ queryKey: itemsKeys.byList(targetId) }),
			])
		} catch (err) {
			setError(errorText(err, m.items_bulk_move_error_failed()))
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{m.items_bulk_move_dialog_title({ count: itemIds.length })}</DialogTitle>
					<DialogDescription>{m.items_bulk_move_dialog_description()}</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="grid gap-2">
						<Label htmlFor="bulk-move-target">{m.items_move_destination_label()}</Label>
						<Select value={selectedListId} onValueChange={setSelectedListId} disabled={submitting}>
							<SelectTrigger id="bulk-move-target">
								<SelectValue placeholder={m.items_list_select_placeholder()} />
							</SelectTrigger>
							<SelectContent>
								{publicLists.length > 0 && (
									<SelectGroup>
										<SelectLabel>{m.items_list_group_public()}</SelectLabel>
										{publicLists.map(l => (
											<SelectItem key={l.id} value={String(l.id)}>
												{l.name}
											</SelectItem>
										))}
									</SelectGroup>
								)}
								{privateLists.length > 0 && (
									<SelectGroup>
										<SelectLabel>{m.items_list_group_private()}</SelectLabel>
										{privateLists.map(l => (
											<SelectItem key={l.id} value={String(l.id)}>
												{l.name}
											</SelectItem>
										))}
									</SelectGroup>
								)}
								{giftIdeasLists.length > 0 && (
									<SelectGroup>
										<SelectLabel>{m.items_list_group_gift_ideas()}</SelectLabel>
										{giftIdeasLists.map(l => (
											<SelectItem key={l.id} value={String(l.id)}>
												{l.name}
											</SelectItem>
										))}
									</SelectGroup>
								)}
								{dependentGroups.map(d => (
									<SelectGroup key={d.dependentId}>
										<SelectLabel>{m.items_list_group_for_dependent({ name: d.dependentName })}</SelectLabel>
										{d.lists.map(l => (
											<SelectItem key={l.id} value={String(l.id)}>
												{l.name}
											</SelectItem>
										))}
									</SelectGroup>
								))}
								<SelectGroup>
									<SelectLabel>{m.items_list_group_other()}</SelectLabel>
									<SelectItem value={NEW_LIST_VALUE}>
										<Plus className="size-4" /> {m.items_bulk_move_create_new()}
									</SelectItem>
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>

					{creatingNew && (
						<div className="grid gap-3 p-3 border rounded-md bg-muted/30">
							<div className="grid gap-2">
								<Label htmlFor="new-list-name">{m.items_bulk_move_new_name_label()}</Label>
								<Input
									id="new-list-name"
									value={newListName}
									onChange={e => setNewListName(e.target.value)}
									placeholder={m.items_bulk_move_new_name_placeholder()}
									disabled={submitting}
									autoFocus
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="new-list-type">{m.items_bulk_move_type_label()}</Label>
								<Select value={newListType} onValueChange={v => setNewListType(v as ListType)} disabled={submitting}>
									<SelectTrigger id="new-list-type">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{listTypeEnumValues
											.filter(t => t !== 'giftideas' && t !== 'test')
											.map(t => (
												<SelectItem key={t} value={t}>
													{listTypeLabel(t)}
												</SelectItem>
											))}
									</SelectContent>
								</Select>
							</div>
							<label className="flex items-center gap-2 text-sm">
								<Checkbox checked={newListPrivate} onCheckedChange={v => setNewListPrivate(v === true)} disabled={submitting} />
								{m.items_bulk_move_private_label()}
							</label>
						</div>
					)}

					<div className="flex items-start gap-2 p-3 border rounded-md">
						<Checkbox
							id="purge-comments"
							checked={purgeComments}
							onCheckedChange={v => setPurgeComments(v === true)}
							disabled={submitting}
							className="mt-0.5"
						/>
						<div className="grid gap-1">
							<Label htmlFor="purge-comments" className="font-normal">
								{m.items_bulk_move_purge_label()}
							</Label>
							<p className="text-xs text-muted-foreground">{m.items_bulk_move_purge_hint()}</p>
						</div>
					</div>

					{error && (
						<Alert variant="destructive">
							<AlertTitle>{m.items_bulk_move_error_title()}</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
				</div>

				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
						{m.action_cancel()}
					</Button>
					<Button onClick={handleMove} disabled={submitting || (!selectedListId && !creatingNew) || (creatingNew && !newListName.trim())}>
						{submitting ? m.items_move_submitting() : m.items_bulk_move_submit({ count: itemIds.length })}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
