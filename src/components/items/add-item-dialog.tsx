import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { Lock, Star } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { createItem } from '@/api/items'
import { getMyLists, type MyListRow } from '@/api/lists'
import ListTypeIcon from '@/components/common/list-type-icon'
import PriorityIcon from '@/components/common/priority-icon'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { type Priority, priorityEnumValues } from '@/db/schema/enums'
import { useScrapeUrl } from '@/lib/use-scrape-url'

import { ImagePicker } from './image-picker'
import { ScrapeProgressAlert } from './scrape-progress-alert'

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
}

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

export function AddItemDialog({ open, onOpenChange }: Props) {
	const router = useRouter()
	const queryClient = useQueryClient()
	const [url, setUrl] = useState('')
	const [title, setTitle] = useState('')
	const [notes, setNotes] = useState('')
	const [price, setPrice] = useState('')
	const [quantity, setQuantity] = useState('1')
	const [priority, setPriority] = useState<Priority>('normal')
	const [selectedListId, setSelectedListId] = useState('')
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	// Image candidates from the scrape. `imageUrl` is the active selection
	// (saved on item create); `imageCandidates` is the full filtered list
	// that drives the picker UI when more than one survives extraction.
	const [imageUrl, setImageUrl] = useState('')
	const [imageCandidates, setImageCandidates] = useState<ReadonlyArray<string>>([])

	// Per-field "did the user touch this?" tracking so a scrape doesn't
	// clobber edits. Refs (not state) — we only consult them at prefill time
	// and don't want to trigger re-renders.
	const titleTouchedRef = useRef(false)
	const priceTouchedRef = useRef(false)
	const notesTouchedRef = useRef(false)
	const lastScrapedUrlRef = useRef('')

	const { state: scrapeState, start: startScrape, cancel: cancelScrape } = useScrapeUrl()

	const { data: myLists } = useQuery({
		queryKey: ['my-lists-for-import'],
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
			setUrl('')
			setTitle('')
			setNotes('')
			setPrice('')
			setQuantity('1')
			setPriority('normal')
			setImageUrl('')
			setImageCandidates([])
			setError(null)
			titleTouchedRef.current = false
			priceTouchedRef.current = false
			notesTouchedRef.current = false
			lastScrapedUrlRef.current = ''
			cancelScrape()
		}
	}, [open, cancelScrape])

	// Prefill empty (or untouched) fields when a scrape result arrives. Runs
	// for both `partial` (a winner is in but parallels still racing) and
	// `done` (final winner). Re-runs harmlessly if `result_updated` swaps the
	// result later — the touched-refs prevent overwriting user edits.
	useEffect(() => {
		if (scrapeState.phase !== 'partial' && scrapeState.phase !== 'done') return
		const result = scrapeState.result
		if (!result) return
		if (!titleTouchedRef.current && result.title) setTitle(result.title)
		if (!priceTouchedRef.current && result.price) setPrice(result.price)
		if (!notesTouchedRef.current && result.description) setNotes(result.description)
		setImageCandidates(result.imageUrls)
		// Only auto-select on the first arrival; once the user has picked we
		// leave their selection alone even if a parallel provider updates the
		// candidate list.
		const firstCandidate = result.imageUrls[0]
		if (!imageUrl && firstCandidate) {
			setImageUrl(firstCandidate)
		}
	}, [scrapeState, imageUrl])

	const formLocked = saving || scrapeState.phase === 'scraping'

	const handleUrlBlur = () => {
		const trimmed = url.trim()
		if (!trimmed) return
		try {
			const parsed = new URL(trimmed)
			if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return
		} catch {
			return
		}
		if (trimmed === lastScrapedUrlRef.current) return
		lastScrapedUrlRef.current = trimmed
		startScrape(trimmed)
	}

	const handleScrapeRetry = () => {
		const trimmed = url.trim()
		if (!trimmed) return
		lastScrapedUrlRef.current = trimmed
		startScrape(trimmed, { force: true })
	}

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
					imageUrl: imageUrl.trim() || undefined,
				},
			})

			if (result.kind === 'error') {
				setError(result.reason === 'not-authorized' ? 'No permission to add to that list.' : 'List not found.')
				return
			}

			toast.success('Item added')
			onOpenChange(false)
			queryClient.invalidateQueries({ queryKey: ['recent', 'items'] })
			await router.invalidate()
			router.navigate({ to: '/lists/$listId/edit', params: { listId: selectedListId } })
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save item')
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add an item</DialogTitle>
					<DialogDescription>Pick a list and fill in the details. You'll be taken to the list after saving.</DialogDescription>
				</DialogHeader>

				<form
					onSubmit={e => {
						e.preventDefault()
						e.stopPropagation()
						handleSave()
					}}
					className="space-y-4"
				>
					<div className="grid gap-2">
						<Label htmlFor="add-item-list">List</Label>
						<Select value={selectedListId} onValueChange={setSelectedListId} disabled={formLocked}>
							<SelectTrigger id="add-item-list" className="w-full">
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
						<Label htmlFor="add-item-title">
							Title <span className="text-destructive">*</span>
						</Label>
						<Input
							id="add-item-title"
							value={title}
							onChange={e => {
								titleTouchedRef.current = true
								setTitle(e.target.value)
							}}
							placeholder="Something cool..."
							disabled={formLocked}
							autoFocus
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="add-item-url">URL</Label>
						<Input
							id="add-item-url"
							type="url"
							value={url}
							onChange={e => setUrl(e.target.value)}
							onBlur={handleUrlBlur}
							placeholder="https://..."
							disabled={saving}
						/>
						<ScrapeProgressAlert state={scrapeState} url={url} onCancel={cancelScrape} onRetry={handleScrapeRetry} className="mt-1" />
						<ImagePicker images={imageCandidates} value={imageUrl} onChange={setImageUrl} disabled={formLocked} className="mt-2" />
					</div>

					<div className="grid gap-2">
						<Label htmlFor="add-item-notes">Notes</Label>
						<Textarea
							id="add-item-notes"
							value={notes}
							onChange={e => {
								notesTouchedRef.current = true
								setNotes(e.target.value)
							}}
							rows={2}
							placeholder="Color, size, model..."
							disabled={formLocked}
						/>
					</div>

					<div className="grid gap-4 sm:grid-cols-3">
						<div className="grid gap-2">
							<Label htmlFor="add-item-priority">Priority</Label>
							<Select value={priority} onValueChange={v => setPriority(v as Priority)} disabled={formLocked}>
								<SelectTrigger id="add-item-priority" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{[...priorityEnumValues].reverse().map(p => (
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
							<Label htmlFor="add-item-price">Price Range</Label>
							<Input
								id="add-item-price"
								value={price}
								onChange={e => {
									priceTouchedRef.current = true
									setPrice(e.target.value)
								}}
								placeholder="$ 0.00"
								inputMode="decimal"
								disabled={formLocked}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="add-item-quantity">Quantity</Label>
							<Input
								id="add-item-quantity"
								type="number"
								min={1}
								max={999}
								value={quantity}
								onChange={e => setQuantity(e.target.value)}
								disabled={formLocked}
							/>
						</div>
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
						<Button type="submit" disabled={formLocked || !title.trim() || !selectedListId}>
							{saving ? 'Saving...' : 'Add Item'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
