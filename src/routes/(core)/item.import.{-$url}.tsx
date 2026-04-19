import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Lock, PlusCircle, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { createItem } from '@/api/items'
import { getMyLists, type MyListRow } from '@/api/lists'
import ListTypeIcon from '@/components/common/list-type-icon'
import PriorityIcon from '@/components/common/priority-icon'
import { priorityEnumValues, type Priority } from '@/db/schema/enums'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

export const Route = createFileRoute('/(core)/item/import/{-$url}')({
	component: ItemImportPage,
})

const PriorityLabels: Record<Priority, string> = {
	low: 'Low',
	normal: 'Normal',
	high: 'High',
	'very-high': 'Very High',
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

function ItemImportPage() {
	const params = Route.useParams()
	const navigate = useNavigate()
	const initialUrl = decodeURIComponent((params as Record<string, string>).url || '')

	const [url, setUrl] = useState(initialUrl)
	const [title, setTitle] = useState('')
	const [notes, setNotes] = useState('')
	const [price, setPrice] = useState('')
	const [quantity, setQuantity] = useState('1')
	const [priority, setPriority] = useState<Priority>('normal')
	const [selectedListId, setSelectedListId] = useState('')
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const { data: myLists } = useQuery({
		queryKey: ['my-lists-for-import'],
		queryFn: () => getMyLists(),
	})

	const publicLists = myLists?.public ?? []
	const privateLists = myLists?.private ?? []
	const giftIdeasLists = myLists?.giftIdeas ?? []
	const editableLists = myLists?.editable ?? []
	const children = myLists?.children ?? []

	// Default to the user's primary list once data loads, falling back to the
	// first list we find across any group.
	useEffect(() => {
		if (selectedListId || !myLists) return
		const allOwned = [...publicLists, ...privateLists, ...giftIdeasLists]
		const primary = allOwned.find(l => l.isPrimary)
		const firstChildList = children.flatMap(c => c.lists)[0]
		const pick = primary ?? allOwned[0] ?? editableLists[0] ?? firstChildList
		if (pick) setSelectedListId(String(pick.id))
	}, [myLists, selectedListId, publicLists, privateLists, giftIdeasLists, editableLists, children])

	const handleSave = async () => {
		const listId = Number(selectedListId)
		if (!listId || !title.trim()) return

		const qty = Number(quantity)
		if (!Number.isFinite(qty) || qty < 1) {
			setError('Quantity must be at least 1')
			return
		}

		setSaving(true)
		setError(null)
		try {
			const result = await createItem({
				data: {
					listId,
					title: title.trim(),
					url: url.trim() || undefined,
					price: price.trim() || undefined,
					priority,
					quantity: qty,
					notes: notes.trim() || undefined,
				},
			})

			if (result.kind === 'error') {
				setError(result.reason === 'not-authorized' ? 'No permission to add to that list.' : 'List not found.')
				return
			}

			toast.success('Item imported')
			navigate({ to: '/lists/$listId/edit', params: { listId: selectedListId } })
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save item')
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Import Item</h1>
					<PlusCircle className="text-blue-500 wish-page-icon" />
				</div>

				<div className="space-y-4 max-w-lg">
					<p className="text-sm text-muted-foreground">
						Pick a list and fill in the details below. Fields are pre-filled from the URL when possible.
					</p>

					<div className="grid gap-2">
						<Label htmlFor="import-list">List</Label>
						<Select value={selectedListId} onValueChange={setSelectedListId} disabled={saving}>
							<SelectTrigger id="import-list" className="w-full">
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

					<div className="grid gap-2">
						<Label htmlFor="import-url">URL</Label>
						<Input
							id="import-url"
							type="url"
							value={url}
							onChange={e => setUrl(e.target.value)}
							placeholder="https://..."
							disabled={saving}
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="import-title">
							Title <span className="text-destructive">*</span>
						</Label>
						<Input
							id="import-title"
							value={title}
							onChange={e => setTitle(e.target.value)}
							placeholder="Something cool…"
							disabled={saving}
							autoFocus
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="import-notes">Notes</Label>
						<Textarea
							id="import-notes"
							value={notes}
							onChange={e => setNotes(e.target.value)}
							rows={2}
							placeholder="Color, size, model…"
							disabled={saving}
						/>
					</div>

					<div className="grid gap-4 sm:grid-cols-3">
						<div className="grid gap-2">
							<Label htmlFor="import-priority">Priority</Label>
							<Select value={priority} onValueChange={v => setPriority(v as Priority)} disabled={saving}>
								<SelectTrigger id="import-priority" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{priorityEnumValues.map(p => (
										<SelectItem key={p} value={p}>
											<span className="inline-flex items-center gap-2">
												<span className="inline-flex size-4 items-center justify-center">
													<PriorityIcon priority={p} />
												</span>
												{PriorityLabels[p]}
											</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="import-price">Price Range</Label>
							<Input
								id="import-price"
								value={price}
								onChange={e => setPrice(e.target.value)}
								placeholder="$ 0.00"
								inputMode="decimal"
								disabled={saving}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="import-quantity">Quantity</Label>
							<Input
								id="import-quantity"
								type="number"
								min={1}
								max={999}
								value={quantity}
								onChange={e => setQuantity(e.target.value)}
								disabled={saving}
							/>
						</div>
					</div>

					{error && (
						<Alert variant="destructive">
							<AlertTitle>Error</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<div className="flex gap-2">
						<Button onClick={handleSave} disabled={saving || !title.trim() || !selectedListId} className="flex-1">
							{saving ? 'Saving…' : 'Add Item'}
						</Button>
						<Button variant="outline" onClick={() => navigate({ to: '/me' })} disabled={saving}>
							Cancel
						</Button>
					</div>
				</div>
			</div>
		</div>
	)
}
