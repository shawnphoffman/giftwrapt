import { useQuery } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { moveItemToList } from '@/api/items'
import { getMyLists } from '@/api/lists'
import type { Item } from '@/db/schema/items'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	item: Item
}

export function MoveItemDialog({ open, onOpenChange, item }: Props) {
	const router = useRouter()
	const [selectedListId, setSelectedListId] = useState<string>('')
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

		setSubmitting(true)
		setError(null)
		try {
			const result = await moveItemToList({ data: { itemId: item.id, targetListId: targetId } })

			if (result.kind === 'error') {
				switch (result.reason) {
					case 'same-list':
						setError('Item is already on that list.')
						break
					case 'not-authorized':
						setError('You don\'t have permission to move to that list.')
						break
					default:
						setError('Item or list not found.')
				}
				return
			}

			if (result.claimsCleared) {
				toast.info(`"${item.title}" moved. Claims were cleared because the list types differ.`)
			} else {
				toast.success(`"${item.title}" moved`)
			}

			onOpenChange(false)
			await router.invalidate()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to move item')
		} finally {
			setSubmitting(false)
		}
	}

	// Filter out the current list from the move targets.
	const publicLists = myLists?.public.filter(l => l.id !== item.listId) ?? []
	const privateLists = myLists?.private.filter(l => l.id !== item.listId) ?? []
	const giftIdeasLists = myLists?.giftIdeas.filter(l => l.id !== item.listId) ?? []
	const hasOptions = publicLists.length > 0 || privateLists.length > 0 || giftIdeasLists.length > 0

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Move "{item.title}"</DialogTitle>
					<DialogDescription>Choose a list to move this item to. Claims may be cleared if the list types differ.</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="grid gap-2">
						<Label htmlFor="move-target">Destination list</Label>
						{!hasOptions ? (
							<p className="text-sm text-muted-foreground">No other lists available to move to.</p>
						) : (
							<Select value={selectedListId} onValueChange={setSelectedListId} disabled={submitting}>
								<SelectTrigger id="move-target">
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

					{error && (
						<Alert variant="destructive">
							<AlertTitle>Couldn't move item</AlertTitle>
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
