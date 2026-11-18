import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { moveItemsToList } from '@/api/items'
import { getMyLists } from '@/api/lists'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Item } from '@/db/schema/items'
import { itemsKeys } from '@/lib/queries/items'
import { m } from '@/paraglide/messages.js'

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	// Only the fields the move flow reads. Callers with a full `Item` still
	// satisfy this; the item-search dialog passes just these three.
	item: Pick<Item, 'id' | 'listId' | 'title'>
	// Optional hook fired after a successful move, so surfaces that keep their
	// own item cache (e.g. the item-search dialog) can refetch.
	onMoved?: () => void
}

export function MoveItemDialog({ open, onOpenChange, item, onMoved }: Props) {
	const router = useRouter()
	const queryClient = useQueryClient()
	const [selectedListId, setSelectedListId] = useState<string>('')
	const [purgeComments, setPurgeComments] = useState(true)
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const { data: myLists } = useQuery({
		queryKey: ['my-lists-for-move'],
		queryFn: () => getMyLists(),
		enabled: open,
	})

	const handleMove = async () => {
		const targetId = Number(selectedListId)
		if (!targetId) return
		if (targetId === item.listId) {
			setError(m.items_move_error_item_same_list())
			return
		}

		setSubmitting(true)
		setError(null)
		try {
			const result = await moveItemsToList({ data: { itemIds: [item.id], targetListId: targetId, purgeComments } })

			if (result.kind === 'error') {
				setError(result.reason === 'not-authorized' ? m.items_move_error_not_authorized() : m.items_move_error_item_not_found())
				return
			}

			const parts: Array<string> = [m.items_move_item_toast_moved({ title: item.title })]
			if (result.claimsCleared > 0) parts.push(m.items_move_toast_claims_cleared())
			if (result.commentsDeleted > 0) parts.push(m.items_move_toast_comments_deleted({ count: result.commentsDeleted }))
			toast.success(parts.join(' · '))

			onOpenChange(false)
			await Promise.all([
				router.invalidate(),
				queryClient.invalidateQueries({ queryKey: itemsKeys.byList(item.listId) }),
				queryClient.invalidateQueries({ queryKey: itemsKeys.byList(targetId) }),
			])
			onMoved?.()
		} catch (err) {
			setError(err instanceof Error ? err.message : m.items_move_error_item_failed())
		} finally {
			setSubmitting(false)
		}
	}

	// Filter out the current list from the move targets.
	const publicLists = myLists?.public.filter(l => l.id !== item.listId) ?? []
	const privateLists = myLists?.private.filter(l => l.id !== item.listId) ?? []
	const giftIdeasLists = myLists?.giftIdeas.filter(l => l.id !== item.listId) ?? []
	const dependentGroups = (myLists?.dependents ?? [])
		.map(d => ({ ...d, lists: d.lists.filter(l => l.id !== item.listId) }))
		.filter(d => d.lists.length > 0)
	const hasOptions = publicLists.length > 0 || privateLists.length > 0 || giftIdeasLists.length > 0 || dependentGroups.length > 0

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{m.items_move_item_dialog_title({ title: item.title })}</DialogTitle>
					<DialogDescription>{m.items_move_item_dialog_description()}</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="grid gap-2">
						<Label htmlFor="move-target">{m.items_move_destination_label()}</Label>
						{!hasOptions ? (
							<p className="text-sm text-muted-foreground">{m.items_move_no_other_lists()}</p>
						) : (
							<Select value={selectedListId} onValueChange={setSelectedListId} disabled={submitting}>
								<SelectTrigger id="move-target">
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
								</SelectContent>
							</Select>
						)}
					</div>

					<div className="flex items-start gap-2 p-3 border rounded-md">
						<Checkbox
							id="purge-comments-single"
							checked={purgeComments}
							onCheckedChange={v => setPurgeComments(v === true)}
							disabled={submitting}
							className="mt-0.5"
						/>
						<div className="grid gap-1">
							<Label htmlFor="purge-comments-single" className="font-normal">
								{m.items_move_item_purge_label()}
							</Label>
							<p className="text-xs text-muted-foreground">{m.items_move_purge_hint()}</p>
						</div>
					</div>

					{error && (
						<Alert variant="destructive">
							<AlertTitle>{m.items_move_item_error_title()}</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
				</div>

				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
						{m.action_cancel()}
					</Button>
					<Button onClick={handleMove} disabled={submitting || !selectedListId}>
						{submitting ? m.items_move_submitting() : m.items_move_submit()}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
