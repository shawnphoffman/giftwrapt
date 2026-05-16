import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { Loader2, Lock, Sparkles, SquarePlus, Star, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { createItem } from '@/api/items'
import { getMyLists, type MyListRow } from '@/api/lists'
import { uploadItemImage } from '@/api/uploads'
import ListTypeIcon from '@/components/common/list-type-icon'
import { MarkdownTextarea } from '@/components/common/markdown-textarea'
import PriorityIcon from '@/components/common/priority-icon'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { type Priority, priorityEnumValues } from '@/db/schema/enums'
import { useStorageStatus } from '@/hooks/use-storage-status'
import { itemsKeys } from '@/lib/queries/items'
import { applyScrapePrefill } from '@/lib/scrapers/apply-prefill'
import { resizeImageForUpload } from '@/lib/storage/client-resize'
import { useScrapeUrl } from '@/lib/use-scrape-url'

import { ImagePicker } from './image-picker'
import { ScrapeProgressAlert } from './scrape-progress-alert'

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	initialUrl?: string
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

export function AddItemDialog({ open, onOpenChange, initialUrl }: Props) {
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
	// Staged file for direct upload. We can't run the upload until the item
	// row exists (the storage key embeds itemId), so we hold onto the File
	// here and post-process after createItem succeeds.
	const [stagedFile, setStagedFile] = useState<File | null>(null)
	const [stagedPreview, setStagedPreview] = useState<string | null>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const { configured: storageConfigured } = useStorageStatus()

	// Track the most recently auto-scraped URL so the blur handler doesn't
	// re-fire on every focus change while the URL is unchanged. Manual
	// re-scrapes via the icon button bypass this and always force.
	const lastScrapedUrlRef = useRef('')

	const { state: scrapeState, start: startScrape, cancel: cancelScrape } = useScrapeUrl()

	const { data: myLists } = useQuery({
		queryKey: ['my-lists-for-import'],
		queryFn: () => getMyLists(),
		enabled: open,
	})

	// Todo lists use a separate row table (todo_items) and reject gift-item
	// creation server-side. Filter them out so they never appear in the
	// list-picker dropdown for this gift-item dialog.
	const publicLists = (myLists?.public ?? []).filter(l => l.type !== 'todos')
	const privateLists = (myLists?.private ?? []).filter(l => l.type !== 'todos')
	const giftIdeasLists = myLists?.giftIdeas ?? []
	const editableLists = (myLists?.editable ?? []).filter(l => l.type !== 'todos')
	const children = (myLists?.children ?? []).map(c => ({
		...c,
		lists: c.lists.filter(l => l.type !== 'todos'),
	}))

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
			setStagedFile(null)
			setStagedPreview(null)
			setError(null)
			lastScrapedUrlRef.current = ''
			cancelScrape()
		}
	}, [open, cancelScrape])

	// Prefill URL + auto-scrape when the dialog opens with an initialUrl
	// (e.g. share-target via /me?url=...). Mirrors handleUrlBlur but fires
	// on open instead of focus loss. Guarded by lastScrapedUrlRef so it
	// can't double-fire if `initialUrl` re-references during the open
	// lifecycle.
	useEffect(() => {
		if (!open || !initialUrl) return
		const trimmed = initialUrl.trim()
		if (!trimmed) return
		if (lastScrapedUrlRef.current === trimmed) return
		setUrl(trimmed)
		lastScrapedUrlRef.current = trimmed
		startScrape(trimmed)
	}, [open, initialUrl, startScrape])

	// Object URL for the staged file's thumbnail preview. Created when a file
	// is picked, revoked on swap or close so the blob memory doesn't linger.
	useEffect(() => {
		if (!stagedFile) {
			setStagedPreview(null)
			return
		}
		const previewUrl = URL.createObjectURL(stagedFile)
		setStagedPreview(previewUrl)
		return () => URL.revokeObjectURL(previewUrl)
	}, [stagedFile])

	// Prefill empty (or untouched) fields when a scrape result arrives. Runs
	// for both `partial` (a winner is in but parallels still racing) and
	// `done` (final winner). Re-runs harmlessly if `result_updated` swaps
	// the result later, since fields that already hold user input are skipped
	// because of the empty-value check.
	useEffect(() => {
		if (scrapeState.phase !== 'partial' && scrapeState.phase !== 'done') return
		const result = scrapeState.result
		if (!result) return
		// Shared "fill if empty" rule (see applyScrapePrefill). Same call
		// handles both the auto-scrape on URL blur and a manual re-scrape
		// via the Sparkles button.
		const update = applyScrapePrefill({ title, price, notes, imageUrl }, result)
		if (update.title !== undefined) setTitle(update.title)
		if (update.price !== undefined) setPrice(update.price)
		if (update.notes !== undefined) setNotes(update.notes)
		if (update.imageUrl !== undefined) setImageUrl(update.imageUrl)
		setImageCandidates(update.imageCandidates)
	}, [scrapeState, imageUrl, title, price, notes])

	const formLocked = saving || scrapeState.phase === 'scraping'
	const scrapeInFlight = scrapeState.phase === 'scraping'

	const isHttpUrl = (raw: string): boolean => {
		const trimmed = raw.trim()
		if (!trimmed) return false
		try {
			const parsed = new URL(trimmed)
			return parsed.protocol === 'http:' || parsed.protocol === 'https:'
		} catch {
			return false
		}
	}

	const urlScrapable = isHttpUrl(url)

	const handleUrlBlur = () => {
		const trimmed = url.trim()
		if (!isHttpUrl(trimmed)) return
		if (trimmed === lastScrapedUrlRef.current) return
		lastScrapedUrlRef.current = trimmed
		startScrape(trimmed)
	}

	const handleScrapeButton = () => {
		const trimmed = url.trim()
		if (!isHttpUrl(trimmed)) return
		// Manual button always forces a fresh scrape so users can re-run after
		// editing the URL or just to bypass the cache.
		lastScrapedUrlRef.current = trimmed
		startScrape(trimmed, { force: true })
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
				if (result.reason === 'not-authorized') {
					setError('No permission to add to that list.')
				} else if (result.reason === 'todo-list-rejects-items') {
					setError("This is a to-do list; it doesn't accept gift items. Add a to-do from the list page instead.")
				} else {
					setError('List not found.')
				}
				return
			}

			// Upload the staged file (if any) now that we have an itemId. The
			// storage key embeds itemId, so this can't run earlier. A failure
			// here doesn't roll back the item; the user can retry the upload
			// from the edit dialog.
			if (stagedFile) {
				try {
					const upload = await resizeImageForUpload(stagedFile)
					const formData = new FormData()
					formData.append('file', upload)
					formData.append('itemId', String(result.item.id))
					const uploadResult = await uploadItemImage({ data: formData })
					if (uploadResult.kind === 'error') {
						toast.error(`Image upload failed: ${uploadResult.message}`)
					}
				} catch (uploadErr) {
					const msg = uploadErr instanceof Error ? uploadErr.message : 'unknown error'
					toast.error(`Image upload failed: ${msg}`)
				}
			}

			toast.success('Item added')
			onOpenChange(false)
			queryClient.invalidateQueries({ queryKey: ['recent', 'items'] })
			await queryClient.invalidateQueries({ queryKey: itemsKeys.byList(listId) })
			router.navigate({ to: '/lists/$listId/edit', params: { listId: selectedListId } })
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save item')
		} finally {
			setSaving(false)
		}
	}

	const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0] ?? null
		e.target.value = ''
		if (!file) return
		setStagedFile(file)
		// A direct upload supersedes any candidate URL selection: the saved
		// item ends up with the uploaded image, so showing both as "selected"
		// would be misleading.
		setImageUrl('')
	}

	const clearStagedFile = () => setStagedFile(null)

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-blue-500 dark:bg-blue-600 ring-1 ring-blue-400/40 dark:ring-blue-600/40 shadow-sm">
							<SquarePlus className="size-[21px] shrink-0 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.4)]" />
						</span>
						Add an item
					</DialogTitle>
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
						<Label htmlFor="add-item-url">URL</Label>
						<InputGroup>
							<InputGroupInput
								id="add-item-url"
								type="url"
								value={url}
								onChange={e => setUrl(e.target.value)}
								onBlur={handleUrlBlur}
								placeholder="https://..."
								disabled={saving}
								autoFocus
							/>
							<InputGroupAddon align="inline-end">
								<InputGroupButton
									type="button"
									aria-label={scrapeInFlight ? 'Importing from URL…' : 'Import details from URL'}
									title={scrapeInFlight ? 'Importing from URL…' : 'Import details from URL'}
									disabled={!urlScrapable || scrapeInFlight || saving}
									onClick={handleScrapeButton}
								>
									{scrapeInFlight ? <Loader2 className="animate-spin" /> : <Sparkles />}
								</InputGroupButton>
							</InputGroupAddon>
						</InputGroup>
						<ScrapeProgressAlert state={scrapeState} url={url} onCancel={cancelScrape} onRetry={handleScrapeRetry} className="mt-1" />
						<ImagePicker
							images={imageCandidates}
							value={imageUrl}
							onChange={u => {
								setImageUrl(u)
								if (u) setStagedFile(null)
							}}
							disabled={formLocked}
							className="mt-2"
						/>
						{storageConfigured && (
							<div className="mt-2 flex items-center gap-2">
								<input type="file" className="hidden" ref={fileInputRef} accept="image/*" onChange={handleFilePick} />
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => fileInputRef.current?.click()}
									disabled={formLocked}
									className="gap-1.5"
								>
									<Upload className="size-4" />
									{stagedFile ? 'Replace image' : 'Upload image'}
								</Button>
								{stagedFile && (
									<>
										{stagedPreview && <img src={stagedPreview} alt="" className="size-9 rounded border object-cover" />}
										<span className="truncate text-xs text-muted-foreground">{stagedFile.name}</span>
										<Button type="button" variant="outline" size="xs" onClick={clearStagedFile} disabled={formLocked} className="gap-1.5">
											<Trash2 className="size-3" />
											Remove
										</Button>
									</>
								)}
							</div>
						)}
					</div>

					<div className="grid gap-2">
						<Label htmlFor="add-item-title">
							Title <span className="text-destructive">*</span>
						</Label>
						<Input
							id="add-item-title"
							value={title}
							onChange={e => setTitle(e.target.value)}
							placeholder="Something cool..."
							disabled={formLocked}
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="add-item-notes">Notes</Label>
						<MarkdownTextarea
							id="add-item-notes"
							value={notes}
							onChange={v => setNotes(v)}
							rows={2}
							placeholder="Color, size, model..."
							disabled={formLocked}
						/>
					</div>

					<div className="grid gap-2">
						<Label id="add-item-priority-label">Priority</Label>
						<ToggleGroup
							type="single"
							variant="outline"
							value={priority}
							onValueChange={v => {
								if (v) setPriority(v as Priority)
							}}
							disabled={formLocked}
							aria-labelledby="add-item-priority-label"
							className="grid w-full grid-cols-4 sm:flex sm:w-fit"
						>
							{[...priorityEnumValues].reverse().map(p => (
								<ToggleGroupItem
									key={p}
									value={p}
									aria-label={PriorityLabels[p]}
									className="min-w-0 px-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground"
								>
									{p !== 'normal' && <PriorityIcon priority={p} />}
									<span className={p === 'normal' ? undefined : 'hidden sm:inline'}>{PriorityLabels[p]}</span>
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
						<div className="grid gap-2">
							<Label htmlFor="add-item-price">Price Range</Label>
							<Input
								id="add-item-price"
								value={price}
								onChange={e => setPrice(e.target.value)}
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
