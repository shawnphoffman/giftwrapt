import { useQuery } from '@tanstack/react-query'
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

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	group: GroupSummary
	itemCount: number
	sourceListId: number
}

export function MoveGroupDialog({ open, onOpenChange, group, itemCount, sourceListId }: Props) {
	const router = useRouter()
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
			setError('Group is already on that list.')
			return
		}

		setSubmitting(true)
		setError(null)
		try {
			const result = await moveGroupToList({ data: { groupId: group.id, targetListId: targetId, purgeComments } })

			if (result.kind === 'error') {
				if (result.reason === 'not-authorized') setError("You don't have permission to move to that list.")
				else if (result.reason === 'same-list') setError('Group is already on that list.')
				else setError('Group or list not found.')
				return
			}

			const label = group.name || 'Group'
			const parts: Array<string> = [`${label} moved (${result.movedItems} item${result.movedItems === 1 ? '' : 's'})`]
			if (result.claimsCleared > 0) parts.push('claims cleared')
			if (result.commentsDeleted > 0) parts.push(`${result.commentsDeleted} comment${result.commentsDeleted === 1 ? '' : 's'} deleted`)
			toast.success(parts.join(' · '))

			onOpenChange(false)
			await router.invalidate()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to move group')
		} finally {
			setSubmitting(false)
		}
	}

	const publicLists = myLists?.public.filter(l => l.id !== sourceListId) ?? []
	const privateLists = myLists?.private.filter(l => l.id !== sourceListId) ?? []
	const giftIdeasLists = myLists?.giftIdeas.filter(l => l.id !== sourceListId) ?? []
	const hasOptions = publicLists.length > 0 || privateLists.length > 0 || giftIdeasLists.length > 0

	const groupLabel = group.name || `${group.type === 'or' ? 'Pick one' : 'In order'} group`

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Move "{groupLabel}"</DialogTitle>
					<DialogDescription>
						Choose a list to move this group and its {itemCount} item{itemCount === 1 ? '' : 's'} to. Claims may be cleared if the list
						types differ.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="grid gap-2">
						<Label htmlFor="move-group-target">Destination list</Label>
						{!hasOptions ? (
							<p className="text-sm text-muted-foreground">No other lists available to move to.</p>
						) : (
							<Select value={selectedListId} onValueChange={setSelectedListId} disabled={submitting}>
								<SelectTrigger id="move-group-target">
									<SelectValue placeholder="Select a list" />
								</SelectTrigger>
								<SelectContent>
									{publicLists.length > 0 && (
										<SelectGroup>
											<SelectLabel>Public</SelectLabel>
											{publicLists.map(l => (
												<SelectItem key={l.id} value={String(l.id)}>
													{l.name}
												</SelectItem>
											))}
										</SelectGroup>
									)}
									{privateLists.length > 0 && (
										<SelectGroup>
											<SelectLabel>Private</SelectLabel>
											{privateLists.map(l => (
												<SelectItem key={l.id} value={String(l.id)}>
													{l.name}
												</SelectItem>
											))}
										</SelectGroup>
									)}
									{giftIdeasLists.length > 0 && (
										<SelectGroup>
											<SelectLabel>Gift Ideas</SelectLabel>
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
									Delete comments on these items
								</Label>
								<p className="text-xs text-muted-foreground">
									Recommended. Comments usually belong to the original list's context. Applies to all {itemCount} item
									{itemCount === 1 ? '' : 's'} in this group.
								</p>
							</div>
						</div>
					)}

					{error && (
						<Alert variant="destructive">
							<AlertTitle>Couldn't move group</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
				</div>

				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
						Cancel
					</Button>
					<Button onClick={handleMove} disabled={submitting || !selectedListId}>
						{submitting ? 'Moving…' : 'Move'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
