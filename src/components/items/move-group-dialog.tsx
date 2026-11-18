import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { moveGroupToList } from '@/api/groups'
import type { GroupSummary } from '@/api/lists'
import { getMyLists } from '@/api/lists'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { errorText } from '@/lib/i18n/errors'
import { itemsKeys } from '@/lib/queries/items'
import { m } from '@/paraglide/messages.js'

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	group: GroupSummary
	itemCount: number
	sourceListId: number
}

export function MoveGroupDialog({ open, onOpenChange, group, itemCount, sourceListId }: Props) {
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
		if (targetId === sourceListId) {
			setError(m.items_move_error_group_same_list())
			return
		}

		setSubmitting(true)
		setError(null)
		try {
			const result = await moveGroupToList({ data: { groupId: group.id, targetListId: targetId, purgeComments } })

			if (result.kind === 'error') {
				if (result.reason === 'not-authorized') setError(m.items_move_error_not_authorized())
				else if (result.reason === 'same-list') setError(m.items_move_error_group_same_list())
				else setError(m.items_move_error_group_not_found())
				return
			}

			const parts: Array<string> = [
				group.name
					? m.items_move_group_toast_named({ name: group.name, count: result.movedItems })
					: m.items_move_group_toast_unnamed({ count: result.movedItems }),
			]
			if (result.claimsCleared > 0) parts.push(m.items_move_toast_claims_cleared())
			if (result.commentsDeleted > 0) parts.push(m.items_move_toast_comments_deleted({ count: result.commentsDeleted }))
			toast.success(parts.join(' · '))

			onOpenChange(false)
			// Group itself moves to a new list (groups live in the route loader),
			// and the items inside it follow. Both source and target item caches
			// must refresh.
			await Promise.all([
				router.invalidate(),
				queryClient.invalidateQueries({ queryKey: itemsKeys.byList(sourceListId) }),
				queryClient.invalidateQueries({ queryKey: itemsKeys.byList(targetId) }),
			])
		} catch (err) {
			setError(errorText(err, m.items_move_error_group_failed()))
		} finally {
			setSubmitting(false)
		}
	}

	const publicLists = myLists?.public.filter(l => l.id !== sourceListId) ?? []
	const privateLists = myLists?.private.filter(l => l.id !== sourceListId) ?? []
	const giftIdeasLists = myLists?.giftIdeas.filter(l => l.id !== sourceListId) ?? []
	const hasOptions = publicLists.length > 0 || privateLists.length > 0 || giftIdeasLists.length > 0

	const groupLabel = group.name || (group.type === 'or' ? m.items_group_unnamed_or() : m.items_group_unnamed_order())

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{m.items_move_group_dialog_title({ name: groupLabel })}</DialogTitle>
					<DialogDescription>{m.items_move_group_dialog_description({ count: itemCount })}</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="grid gap-2">
						<Label htmlFor="move-group-target">{m.items_move_destination_label()}</Label>
						{!hasOptions ? (
							<p className="text-sm text-muted-foreground">{m.items_move_no_other_lists()}</p>
						) : (
							<Select value={selectedListId} onValueChange={setSelectedListId} disabled={submitting}>
								<SelectTrigger id="move-group-target">
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
								</SelectContent>
							</Select>
						)}
					</div>

					{itemCount > 0 && (
						<div className="flex items-start gap-2 p-3 border rounded-md">
							<Checkbox
								id="purge-comments-group"
								checked={purgeComments}
								onCheckedChange={v => setPurgeComments(v === true)}
								disabled={submitting}
								className="mt-0.5"
							/>
							<div className="grid gap-1">
								<Label htmlFor="purge-comments-group" className="font-normal">
									{m.items_move_group_purge_label()}
								</Label>
								<p className="text-xs text-muted-foreground">{m.items_move_group_purge_hint({ count: itemCount })}</p>
							</div>
						</div>
					)}

					{error && (
						<Alert variant="destructive">
							<AlertTitle>{m.items_move_group_error_title()}</AlertTitle>
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
