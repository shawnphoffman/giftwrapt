import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { copyItemToList } from '@/api/items'
import { getMyLists, type MyListRow } from '@/api/lists'
import ListTypeIcon from '@/components/common/list-type-icon'
import { RichMessage } from '@/components/common/rich-message'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { errorText } from '@/lib/i18n/errors'
import { itemsKeys } from '@/lib/queries/items'
import { m } from '@/paraglide/messages.js'

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

	// A todo list takes no gift items (the server refuses the copy), so it
	// is never offered as a target. Same filter as the Add Item dialog.
	const publicLists = (myLists?.public ?? []).filter(l => l.type !== 'todos')
	const privateLists = (myLists?.private ?? []).filter(l => l.type !== 'todos')
	const giftIdeasLists = myLists?.giftIdeas ?? []
	const editableLists = (myLists?.editable ?? []).filter(l => l.type !== 'todos')
	const children = (myLists?.children ?? []).map(c => ({ ...c, lists: c.lists.filter(l => l.type !== 'todos') }))

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

	const findListName = (id: number): string | undefined => {
		const all: Array<MyListRow> = [...publicLists, ...privateLists, ...giftIdeasLists, ...editableLists, ...children.flatMap(c => c.lists)]
		return all.find(l => l.id === id)?.name
	}

	const handleCopy = async () => {
		const targetListId = Number(selectedListId)
		if (!targetListId) return
		setSaving(true)
		setError(null)
		try {
			const result = await copyItemToList({ data: { itemId, targetListId } })
			if (result.kind === 'error') {
				if (result.reason === 'not-authorized') setError(m.items_copy_error_not_authorized())
				else if (result.reason === 'source-not-visible') setError(m.items_copy_error_source_not_visible())
				else if (result.reason === 'todo-list-rejects-items') setError(m.items_error_todo_list())
				else setError(m.items_copy_error_not_found())
				return
			}
			const listName = findListName(targetListId)
			toast.success(listName === undefined ? m.items_copy_toast_fallback() : m.items_copy_toast({ listName }))
			await queryClient.invalidateQueries({ queryKey: itemsKeys.byList(targetListId) })
			onOpenChange(false)
		} catch (err) {
			setError(errorText(err, m.items_copy_error_failed()))
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{m.items_copy_dialog_title()}</DialogTitle>
					<DialogDescription>
						<RichMessage
							parts={m.items_copy_dialog_description.parts({ itemTitle })}
							tags={{ title: content => <span className="font-medium">{content}</span> }}
						/>
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
						<Label htmlFor="copy-item-list">{m.items_field_list()}</Label>
						<Select value={selectedListId} onValueChange={setSelectedListId} disabled={saving}>
							<SelectTrigger id="copy-item-list" className="w-full">
								<SelectValue placeholder={m.items_list_select_placeholder()} />
							</SelectTrigger>
							<SelectContent>
								{publicLists.length > 0 && (
									<SelectGroup>
										<SelectLabel>{m.items_list_group_my_public()}</SelectLabel>
										{publicLists.map(l => (
											<ListSelectItem key={l.id} list={l} />
										))}
									</SelectGroup>
								)}
								{privateLists.length > 0 && (
									<SelectGroup>
										<SelectLabel>{m.items_list_group_my_private()}</SelectLabel>
										{privateLists.map(l => (
											<ListSelectItem key={l.id} list={l} />
										))}
									</SelectGroup>
								)}
								{giftIdeasLists.length > 0 && (
									<SelectGroup>
										<SelectLabel>{m.items_list_group_gift_ideas()}</SelectLabel>
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
										<SelectLabel>{m.items_list_group_editable()}</SelectLabel>
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
							<AlertTitle>{m.items_error_title()}</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
							{m.action_cancel()}
						</Button>
						<Button type="submit" disabled={saving || !selectedListId}>
							{saving ? m.items_copy_submitting() : m.action_copy()}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
