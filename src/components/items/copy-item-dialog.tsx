import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { copyItemToList } from '@/api/items'
import { getMyLists, type MyListRow } from '@/api/lists'
import ListTypeIcon from '@/components/common/list-type-icon'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { itemsKeys } from '@/lib/queries/items'

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	itemId: number
	itemTitle: string
}

type ListOption = Pick<MyListRow, 'id' | 'name' | 'type' | 'isPrivate' | 'isPrimary'>

function ListSelectItem({ list, owner }: { list: ListOption; owner?: { name: string | null; email: string } }) {
	return (
		<SelectItem value={String(list.id)}>
			<ListTypeIcon type={list.type} className="size-4 shrink-0" />
			<span className="truncate">{list.name}</span>
			{list.isPrimary && <Star className="size-3.5 text-yellow-500 fill-yellow-500 shrink-0" />}
			{list.isPrivate && <Lock className="size-3.5 text-muted-foreground shrink-0" />}
			{owner && (
				<Badge variant="secondary" className="ml-auto text-xs shrink-0">
					{owner.name || owner.email}
				</Badge>
			)}
		</SelectItem>
	)
}

export function CopyItemDialog({ open, onOpenChange, itemId, itemTitle }: Props) {
	const queryClient = useQueryClient()
	const [selectedListId, setSelectedListId] = useState('')
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const { data: myLists } = useQuery({
		queryKey: ['my-lists-for-copy'],
		queryFn: () => getMyLists(),
		enabled: open,
	})

	const publicLists = myLists?.public ?? []
	const privateLists = myLists?.private ?? []
	const giftIdeasLists = myLists?.giftIdeas ?? []
	const editableLists = myLists?.editable ?? []
	const children = myLists?.children ?? []

	useEffect(() => {
		if (selectedListId || !myLists) return
		const allOwned = [...publicLists, ...privateLists, ...giftIdeasLists]
		const primary = allOwned.find(l => l.isPrimary)
		const firstChildList = children.flatMap(c => c.lists).at(0)
		const pick = primary ?? allOwned.at(0) ?? editableLists.at(0) ?? firstChildList
		if (pick) setSelectedListId(String(pick.id))
	}, [myLists, selectedListId, publicLists, privateLists, giftIdeasLists, editableLists, children])

	useEffect(() => {
		if (!open) {
			setSelectedListId('')
			setError(null)
			setSaving(false)
		}
	}, [open])

	const findListName = (id: number): string => {
		const all: Array<MyListRow> = [...publicLists, ...privateLists, ...giftIdeasLists, ...editableLists, ...children.flatMap(c => c.lists)]
		return all.find(l => l.id === id)?.name ?? 'list'
	}

	const handleCopy = async () => {
		const targetListId = Number(selectedListId)
		if (!targetListId) return
		setSaving(true)
		setError(null)
		try {
			const result = await copyItemToList({ data: { itemId, targetListId } })
			if (result.kind === 'error') {
				if (result.reason === 'not-authorized') setError('You no longer have permission to add items to that list.')
				else if (result.reason === 'source-not-visible') setError('This list is no longer visible to you.')
				else setError('Item or list not found.')
				return
			}
			toast.success(`Copied to ${findListName(targetListId)}`)
			await queryClient.invalidateQueries({ queryKey: itemsKeys.byList(targetListId) })
			onOpenChange(false)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to copy item')
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Copy to your list</DialogTitle>
					<DialogDescription>
						Pick a list to copy <span className="font-medium">{itemTitle}</span> into. The original is left untouched.
					</DialogDescription>
				</DialogHeader>

				<form
					onSubmit={e => {
						e.preventDefault()
						e.stopPropagation()
						handleCopy()
					}}
					className="space-y-4"
				>
					<div className="grid gap-2">
						<Label htmlFor="copy-item-list">List</Label>
						<Select value={selectedListId} onValueChange={setSelectedListId} disabled={saving}>
							<SelectTrigger id="copy-item-list" className="w-full">
								<SelectValue placeholder="Select a list" />
							</SelectTrigger>
							<SelectContent>
								{publicLists.length > 0 && (
									<SelectGroup>
										<SelectLabel>My Public Lists</SelectLabel>
										{publicLists.map(l => (
											<ListSelectItem key={l.id} list={l} />
										))}
									</SelectGroup>
								)}
								{privateLists.length > 0 && (
									<SelectGroup>
										<SelectLabel>My Private Lists</SelectLabel>
										{privateLists.map(l => (
											<ListSelectItem key={l.id} list={l} />
										))}
									</SelectGroup>
								)}
								{giftIdeasLists.length > 0 && (
									<SelectGroup>
										<SelectLabel>Gift Ideas</SelectLabel>
										{giftIdeasLists.map(l => (
											<ListSelectItem key={l.id} list={l} />
										))}
									</SelectGroup>
								)}
								{children.map(
									child =>
										child.lists.length > 0 && (
											<SelectGroup key={child.childId}>
												<SelectLabel>{child.childName || child.childEmail}</SelectLabel>
												{child.lists.map(l => (
													<ListSelectItem key={l.id} list={l} />
												))}
											</SelectGroup>
										)
								)}
								{editableLists.length > 0 && (
									<SelectGroup>
										<SelectLabel>Lists I Can Edit</SelectLabel>
										{editableLists.map(l => (
											<ListSelectItem key={l.id} list={l} owner={{ name: l.ownerName, email: l.ownerEmail }} />
										))}
									</SelectGroup>
								)}
							</SelectContent>
						</Select>
					</div>

					{error && (
						<Alert variant="destructive">
							<AlertTitle>Error</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
							Cancel
						</Button>
						<Button type="submit" disabled={saving || !selectedListId}>
							{saving ? 'Copying...' : 'Copy'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
