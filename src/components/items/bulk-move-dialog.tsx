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
import { type ListType, listTypeEnumValues, ListTypes } from '@/db/schema/enums'
import { itemsKeys } from '@/lib/queries/items'

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

	const creatingNew = selectedListId === NEW_LIST_VALUE
	const isGiftIdeas = newListType === 'giftideas'

	const handleMove = async () => {
		setSubmitting(true)
		setError(null)
		try {
			let targetId: number
			if (creatingNew) {
				if (!newListName.trim()) {
					setError('New list name is required.')
					setSubmitting(false)
					return
				}
				if (isGiftIdeas) {
					setError('Gift Ideas lists need a target person. Create it from "New list" on My Lists.')
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
				setError(result.reason === 'not-authorized' ? "You don't have permission to move to that list." : 'Could not move items.')
				return
			}

			const msgs = [`${result.moved} item${result.moved === 1 ? '' : 's'} moved`]
			if (result.claimsCleared > 0) msgs.push(`${result.claimsCleared} claim${result.claimsCleared === 1 ? '' : 's'} cleared`)
			if (result.commentsDeleted > 0) msgs.push(`${result.commentsDeleted} comment${result.commentsDeleted === 1 ? '' : 's'} deleted`)
			toast.success(msgs.join(' · '))

			onOpenChange(false)
			onMoved?.()
			await Promise.all([
				router.invalidate(),
				qc.invalidateQueries({ queryKey: itemsKeys.byList(sourceListId) }),
				qc.invalidateQueries({ queryKey: itemsKeys.byList(targetId) }),
			])
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to move items')
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						Move {itemIds.length} item{itemIds.length === 1 ? '' : 's'}
					</DialogTitle>
					<DialogDescription>Choose a destination list. Claims may be cleared if list types differ.</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="grid gap-2">
						<Label htmlFor="bulk-move-target">Destination list</Label>
						<Select value={selectedListId} onValueChange={setSelectedListId} disabled={submitting}>
							<SelectTrigger id="bulk-move-target">
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
								<SelectGroup>
									<SelectLabel>Other</SelectLabel>
									<SelectItem value={NEW_LIST_VALUE}>
										<Plus className="size-4" /> Create a new list…
									</SelectItem>
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>

					{creatingNew && (
						<div className="grid gap-3 p-3 border rounded-md bg-muted/30">
							<div className="grid gap-2">
								<Label htmlFor="new-list-name">New list name</Label>
								<Input
									id="new-list-name"
									value={newListName}
									onChange={e => setNewListName(e.target.value)}
									placeholder="e.g. Wish List 2027"
									disabled={submitting}
									autoFocus
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="new-list-type">Type</Label>
								<Select value={newListType} onValueChange={v => setNewListType(v as ListType)} disabled={submitting}>
									<SelectTrigger id="new-list-type">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{listTypeEnumValues
											.filter(t => t !== 'giftideas' && t !== 'test')
											.map(t => (
												<SelectItem key={t} value={t}>
													{ListTypes[t]}
												</SelectItem>
											))}
									</SelectContent>
								</Select>
							</div>
							<label className="flex items-center gap-2 text-sm">
								<Checkbox checked={newListPrivate} onCheckedChange={v => setNewListPrivate(v === true)} disabled={submitting} />
								Private list
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
								Delete comments on moved items
							</Label>
							<p className="text-xs text-muted-foreground">Recommended. Comments typically belong to the original list's context.</p>
						</div>
					</div>

					{error && (
						<Alert variant="destructive">
							<AlertTitle>Couldn't move items</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
				</div>

				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
						Cancel
					</Button>
					<Button onClick={handleMove} disabled={submitting || (!selectedListId && !creatingNew) || (creatingNew && !newListName.trim())}>
						{submitting ? 'Moving…' : `Move ${itemIds.length}`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
