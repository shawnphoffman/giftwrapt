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
import { useMoney } from '@/hooks/use-money'
import { useStorageStatus } from '@/hooks/use-storage-status'
import { errorText } from '@/lib/i18n/errors'
import { priorityLabel } from '@/lib/i18n/labels'
import { itemsKeys } from '@/lib/queries/items'
import { applyScrapePrefill } from '@/lib/scrapers/apply-prefill'
import { resizeImageForUpload } from '@/lib/storage/client-resize'
import { normalizeHttpUrl } from '@/lib/urls'
import { useScrapeUrl } from '@/lib/use-scrape-url'
import { m } from '@/paraglide/messages.js'

import { ImagePicker } from './image-picker'
import { ScrapeProgressAlert } from './scrape-progress-alert'

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	initialUrl?: string
}

type ListOption = Pick<MyListRow, 'id' | 'name' | 'type' | 'isPrivate' | 'isPrimary'>

// Shows the expected shape of a link; not translated.
const URL_PLACEHOLDER = 'https://...'

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
	const money = useMoney()
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
	// Tracks the exact field values the scrape itself last wrote, so a later
	// scrape event (e.g. the AI-cleaned title in `result_updated`) can upgrade
	// a field it filled one event earlier without clobbering a user edit.
	const lastScrapeAppliedRef = useRef<Partial<{ title: string; price: string; notes: string; imageUrl: string }>>({})
	// Latest field values, mirrored each render so the prefill effect can read
	// them without listing them as dependencies. If the effect re-ran on every
	// field change, clearing a prefilled field would immediately re-trigger the
	// "fill if empty" rule and put the scraped value straight back.
	const fieldsRef = useRef({ title, price, notes, imageUrl })
	fieldsRef.current = { title, price, notes, imageUrl }

	const { state: scrapeState, start: startScrape, cancel: cancelScrape, reset: resetScrape } = useScrapeUrl()

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
			lastScrapeAppliedRef.current = {}
			// Full reset (not cancel): clears a completed "Imported in N.Ns"
			// alert so it doesn't linger when the dialog is reopened for the
			// next item.
			resetScrape()
		}
	}, [open, resetScrape])

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
	// `done` (final winner). Re-runs if `result_updated` swaps the result
	// later; fields the user has edited are skipped because they no longer
	// match what the scrape last wrote. Deliberately keyed on scrape events
	// only (not field values): the user clearing a field must not count as
	// "empty, fill it again".
	useEffect(() => {
		if (scrapeState.phase !== 'partial' && scrapeState.phase !== 'done') return
		const result = scrapeState.result
		if (!result) return
		// Shared "fill if empty" rule (see applyScrapePrefill). Same call
		// handles both the auto-scrape on URL blur and a manual re-scrape
		// via the Sparkles button.
		const applied = lastScrapeAppliedRef.current
		const update = applyScrapePrefill(fieldsRef.current, result, applied)
		if (update.title !== undefined) {
			setTitle(update.title)
			applied.title = update.title
		}
		if (update.price !== undefined) {
			setPrice(update.price)
			applied.price = update.price
		}
		if (update.notes !== undefined) {
			setNotes(update.notes)
			applied.notes = update.notes
		}
		if (update.imageUrl !== undefined) {
			setImageUrl(update.imageUrl)
			applied.imageUrl = update.imageUrl
		}
		setImageCandidates(update.imageCandidates)
	}, [scrapeState])

	const formLocked = saving || scrapeState.phase === 'scraping'
	const scrapeInFlight = scrapeState.phase === 'scraping'

	// Scheme-less input (`www.amazon.com/...`) is the common paste shape, so
	// the gate coerces rather than rejects. The scrape handlers write the
	// coerced form back into the field so what gets saved is a real link.
	const urlScrapable = normalizeHttpUrl(url) !== null

	const handleUrlBlur = () => {
		const normalized = normalizeHttpUrl(url)
		if (!normalized) return
		if (normalized !== url) setUrl(normalized)
		if (normalized === lastScrapedUrlRef.current) return
		lastScrapedUrlRef.current = normalized
		startScrape(normalized)
	}

	const handleScrapeButton = () => {
		const normalized = normalizeHttpUrl(url)
		if (!normalized) return
		if (normalized !== url) setUrl(normalized)
		// Manual button always forces a fresh scrape so users can re-run after
		// editing the URL or just to bypass the cache.
		lastScrapedUrlRef.current = normalized
		startScrape(normalized, { force: true })
	}

	const handleScrapeRetry = () => {
		const normalized = normalizeHttpUrl(url) ?? url.trim()
		if (!normalized) return
		lastScrapedUrlRef.current = normalized
		startScrape(normalized, { force: true })
	}

	const handleSave = async () => {
		const listId = Number(selectedListId)
		if (!listId || !title.trim()) return

		const qty = Number(quantity)
		if (!Number.isFinite(qty) || qty < 1) {
			setError(m.items_add_error_quantity_min())
			return
		}

		setSaving(true)
		setError(null)
		try {
			const result = await createItem({
				data: {
					listId,
					title: title.trim(),
					url: (normalizeHttpUrl(url) ?? url.trim()) || undefined,
					price: price.trim() || undefined,
					priority,
					quantity: qty,
					notes: notes.trim() || undefined,
					imageUrl: imageUrl.trim() || undefined,
				},
			})

			if (result.kind === 'error') {
				if (result.reason === 'not-authorized') {
					setError(m.items_add_error_not_authorized())
				} else if (result.reason === 'todo-list-rejects-items') {
					setError(m.items_error_todo_list())
				} else {
					setError(m.items_error_list_not_found())
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
						toast.error(m.items_image_upload_failed({ message: uploadResult.message }))
					}
				} catch (uploadErr) {
					const msg = errorText(uploadErr, m.items_unknown_error())
					toast.error(m.items_image_upload_failed({ message: msg }))
				}
			}

			toast.success(m.items_toast_added())
			onOpenChange(false)
			queryClient.invalidateQueries({ queryKey: ['recent', 'items'] })
			await queryClient.invalidateQueries({ queryKey: itemsKeys.byList(listId) })
			router.navigate({ to: '/lists/$listId/edit', params: { listId: selectedListId } })
		} catch (err) {
			setError(errorText(err, m.items_error_save_failed()))
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
							<SquarePlus className="size-5.25 shrink-0 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.4)]" />
						</span>
						{m.items_add_dialog_title()}
					</DialogTitle>
					<DialogDescription>{m.items_add_dialog_description()}</DialogDescription>
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
						<Label htmlFor="add-item-list">{m.items_field_list()}</Label>
						<Select value={selectedListId} onValueChange={setSelectedListId} disabled={formLocked}>
							<SelectTrigger id="add-item-list" className="w-full">
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

					<div className="grid gap-2">
						<Label htmlFor="add-item-url">{m.items_field_url()}</Label>
						<InputGroup>
							<InputGroupInput
								id="add-item-url"
								type="url"
								value={url}
								onChange={e => setUrl(e.target.value)}
								onBlur={handleUrlBlur}
								placeholder={URL_PLACEHOLDER}
								disabled={saving}
								autoFocus
							/>
							<InputGroupAddon align="inline-end">
								<InputGroupButton
									type="button"
									size="icon-xs"
									aria-label={scrapeInFlight ? m.items_scrape_button_busy() : m.items_scrape_button()}
									title={scrapeInFlight ? m.items_scrape_button_busy() : m.items_scrape_button()}
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
					</div>

					<div className="grid gap-2">
						<Label htmlFor="add-item-title">
							{m.items_field_title()} <span className="text-destructive">*</span>
						</Label>
						<Input
							id="add-item-title"
							autoComplete="off"
							data-1p-ignore
							data-lpignore="true"
							value={title}
							onChange={e => setTitle(e.target.value)}
							placeholder={m.items_add_title_placeholder()}
							disabled={formLocked}
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="add-item-notes">{m.items_field_notes()}</Label>
						<MarkdownTextarea
							id="add-item-notes"
							value={notes}
							onChange={v => setNotes(v)}
							rows={2}
							placeholder={m.items_add_notes_placeholder()}
							disabled={formLocked}
						/>
					</div>

					<div className="@container/priority grid gap-2">
						<Label id="add-item-priority-label">{m.items_field_priority()}</Label>
						{/* One row of four, or two by two once the field is too narrow for "Normal" (a phone with the text size turned up). */}
						<ToggleGroup
							type="single"
							variant="outline"
							value={priority}
							onValueChange={v => {
								if (v) setPriority(v as Priority)
							}}
							disabled={formLocked}
							aria-labelledby="add-item-priority-label"
							className="grid w-full grid-cols-4 sm:flex sm:w-fit @max-[12.5rem]/priority:grid-cols-2 @max-[12.5rem]/priority:gap-1"
						>
							{[...priorityEnumValues].reverse().map(p => (
								<ToggleGroupItem
									key={p}
									value={p}
									aria-label={priorityLabel(p)}
									className="min-w-0 px-1.5 @max-[12.5rem]/priority:rounded-md! @max-[12.5rem]/priority:border! data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground"
								>
									{p !== 'normal' && <PriorityIcon priority={p} />}
									<span className={p === 'normal' ? undefined : 'hidden sm:inline'}>{priorityLabel(p)}</span>
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
						<div className="grid gap-2">
							<Label htmlFor="add-item-price">{m.items_field_price_range()}</Label>
							<Input
								id="add-item-price"
								value={price}
								onChange={e => setPrice(e.target.value)}
								placeholder={money.amount(0)}
								inputMode="decimal"
								disabled={formLocked}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="add-item-quantity">{m.items_field_quantity()}</Label>
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

					{storageConfigured && (
						<div className="flex items-center gap-2">
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
								{stagedFile ? m.items_image_replace_button() : m.items_image_upload_button()}
							</Button>
							{stagedFile && (
								<>
									{stagedPreview && <img src={stagedPreview} alt="" className="size-9 rounded border object-cover" />}
									<span className="truncate text-xs text-muted-foreground">{stagedFile.name}</span>
									<Button type="button" variant="outline" size="sm" onClick={clearStagedFile} disabled={formLocked} className="gap-1.5">
										<Trash2 className="size-4" />
										{m.action_remove()}
									</Button>
								</>
							)}
						</div>
					)}

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
						<Button type="submit" disabled={formLocked || !title.trim() || !selectedListId}>
							{saving ? m.items_saving_dots() : m.items_add_submit()}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
