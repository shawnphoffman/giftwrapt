import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Sparkles, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { createItem } from '@/api/items'
import { removeItemImage, uploadItemImage } from '@/api/uploads'
import { MarkdownTextarea } from '@/components/common/markdown-textarea'
import PriorityIcon from '@/components/common/priority-icon'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { priorityEnumValues } from '@/db/schema/enums'
import type { Item } from '@/db/schema/items'
import { useStorageStatus } from '@/hooks/use-storage-status'
import { useUpdateItem } from '@/lib/mutations/update-item'
import { itemsKeys } from '@/lib/queries/items'
import { applyScrapePrefill } from '@/lib/scrapers/apply-prefill'
import { resizeImageForUpload } from '@/lib/storage/client-resize'
import { useScrapeUrl } from '@/lib/use-scrape-url'
import { LIMITS } from '@/lib/validation/limits'

import { ImagePicker } from './image-picker'
import { ScrapeProgressAlert } from './scrape-progress-alert'

type BaseProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
}

type CreateProps = BaseProps & { mode: 'create'; listId: number; item?: never; groupId?: number | null }
type EditProps = BaseProps & { mode: 'edit'; listId?: never; item: Item; groupId?: never }

type Props = CreateProps | EditProps

const PriorityLabels: Record<string, string> = {
	low: 'Low',
	normal: 'Normal',
	high: 'High',
	'very-high': 'Very High',
}

const schema = z.object({
	title: z.string().min(1, 'Title is required').max(LIMITS.ITEM_TITLE),
	url: z.string().max(LIMITS.URL).optional(),
	price: z.string().max(LIMITS.PRICE).optional(),
	notes: z.string().max(LIMITS.LONG_TEXT).optional(),
	priority: z.enum(priorityEnumValues),
	quantity: z.coerce.number().int().positive('Must be at least 1').max(999),
	imageUrl: z.string().max(LIMITS.URL).optional(),
})

export function ItemFormDialog(props: Props) {
	const { open, onOpenChange } = props
	const isEdit = props.mode === 'edit'
	const queryClient = useQueryClient()
	const updateMutation = useUpdateItem()
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [uploadingImage, setUploadingImage] = useState(false)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const { configured: storageConfigured } = useStorageStatus()
	// Upload UI is only offered when the item already exists (itemId required
	// for the upload endpoint) AND storage is configured on the server.
	const showUploadButton = isEdit && storageConfigured

	// Scrape integration. lastScrapedUrlRef stops the blur handler from
	// re-firing on every focus change while the URL is unchanged; manual
	// re-scrapes via the icon button bypass it and always force.
	const { state: scrapeState, start: startScrape, cancel: cancelScrape } = useScrapeUrl()
	const lastScrapedUrlRef = useRef('')
	const [imageCandidates, setImageCandidates] = useState<ReadonlyArray<string>>([])

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

	// Items whose URL points back into our own /lists/:id route are
	// "sublist" links, not external products. Skip scraping them.
	const isSublistUrl = (raw: string): boolean => {
		const trimmed = raw.trim()
		if (!trimmed) return false
		try {
			const parsed = new URL(trimmed)
			if (typeof window !== 'undefined' && parsed.origin !== window.location.origin) return false
			return /^\/lists\/\d+(?:\/|$)/.test(parsed.pathname)
		} catch {
			return false
		}
	}

	const form = useForm({
		defaultValues: {
			title: isEdit ? props.item.title : '',
			url: isEdit ? (props.item.url ?? '') : '',
			price: isEdit ? (props.item.price ?? '') : '',
			notes: isEdit ? (props.item.notes ?? '') : '',
			priority: isEdit ? props.item.priority : 'normal',
			quantity: isEdit ? String(props.item.quantity) : '1',
			imageUrl: isEdit ? (props.item.imageUrl ?? '') : '',
		},
		onSubmit: async ({ value }) => {
			const parsed = schema.safeParse(value)
			if (!parsed.success) {
				setError(parsed.error.issues.map(e => e.message).join(', '))
				return
			}

			if (isEdit) {
				// Optimistic edit: close immediately so the row shows the new
				// content right away. The mutation patches the items cache via
				// onMutate, then writes the server's canonical row on success or
				// rolls back on error. A spinner on the row signals the in-flight
				// state via useIsMutating in ItemEditRow / ItemRow.
				const trimmedUrl = parsed.data.url?.trim() || null
				const trimmedPrice = parsed.data.price?.trim() || null
				const trimmedNotes = parsed.data.notes?.trim() || null
				const trimmedImageUrl = parsed.data.imageUrl?.trim() || null

				onOpenChange(false)
				form.reset()
				setError(null)
				try {
					const result = await updateMutation.mutateAsync({
						listId: props.item.listId,
						itemId: props.item.id,
						title: parsed.data.title,
						url: trimmedUrl,
						price: trimmedPrice,
						notes: trimmedNotes,
						priority: parsed.data.priority,
						quantity: parsed.data.quantity,
						imageUrl: trimmedImageUrl,
					})
					if (result.kind === 'error') {
						toast.error(result.reason === 'not-authorized' ? 'You no longer have permission to edit this item.' : 'Item not found.')
						return
					}
					toast.success('Item updated')
				} catch (err) {
					toast.error(err instanceof Error ? err.message : 'Failed to save item')
				}
				return
			}

			setSubmitting(true)
			setError(null)
			try {
				const result = await createItem({
					data: {
						listId: props.listId,
						title: parsed.data.title,
						url: parsed.data.url?.trim() || undefined,
						price: parsed.data.price?.trim() || undefined,
						notes: parsed.data.notes?.trim() || undefined,
						priority: parsed.data.priority,
						quantity: parsed.data.quantity,
						imageUrl: parsed.data.imageUrl?.trim() || undefined,
						groupId: props.groupId ?? undefined,
					},
				})

				if (result.kind === 'error') {
					setError(result.reason === 'not-authorized' ? 'You no longer have permission to add items to this list.' : 'List not found.')
					return
				}

				toast.success('Item added')
				onOpenChange(false)
				form.reset()
				queryClient.invalidateQueries({ queryKey: ['recent', 'items'] })
				await queryClient.invalidateQueries({ queryKey: itemsKeys.byList(props.listId) })
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to save item')
			} finally {
				setSubmitting(false)
			}
		},
	})

	// Shared "fill if empty" rule (see applyScrapePrefill). Same call
	// handles both the auto-scrape on URL blur and a manual re-scrape via
	// the Sparkles button.
	useEffect(() => {
		if (scrapeState.phase !== 'partial' && scrapeState.phase !== 'done') return
		const result = scrapeState.result
		if (!result) return
		const values = form.state.values
		const update = applyScrapePrefill({ title: values.title, price: values.price, notes: values.notes, imageUrl: values.imageUrl }, result)
		if (update.title !== undefined) form.setFieldValue('title', update.title)
		if (update.price !== undefined) form.setFieldValue('price', update.price)
		if (update.notes !== undefined) form.setFieldValue('notes', update.notes)
		if (update.imageUrl !== undefined) form.setFieldValue('imageUrl', update.imageUrl)
		setImageCandidates(update.imageCandidates)
	}, [scrapeState, form])

	// Tear down any in-flight scrape and reset prefill state when the dialog
	// closes. The form itself is reset by callers post-submit; this runs
	// regardless to clean up the side-effect of opening + closing without
	// saving.
	useEffect(() => {
		if (open) return
		cancelScrape()
		lastScrapedUrlRef.current = ''
		setImageCandidates([])
	}, [open, cancelScrape])

	const formLocked = submitting || scrapeState.phase === 'scraping'
	const scrapeInFlight = scrapeState.phase === 'scraping'

	const triggerAutoScrape = (rawUrl: string) => {
		const trimmed = rawUrl.trim()
		if (!isHttpUrl(trimmed)) return
		if (isSublistUrl(trimmed)) return
		if (trimmed === lastScrapedUrlRef.current) return
		lastScrapedUrlRef.current = trimmed
		startScrape(trimmed)
	}

	const triggerManualScrape = (rawUrl: string) => {
		const trimmed = rawUrl.trim()
		if (!isHttpUrl(trimmed)) return
		if (isSublistUrl(trimmed)) return
		// Manual button always forces a fresh scrape so users can re-run after
		// editing the URL or just to bypass the cache.
		lastScrapedUrlRef.current = trimmed
		startScrape(trimmed, { force: true, ...(isEdit ? { itemId: props.item.id } : {}) })
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{isEdit ? 'Edit item' : 'Add item'}</DialogTitle>
					<DialogDescription>{isEdit ? 'Update the details for this item.' : 'Add a new item to your list.'}</DialogDescription>
				</DialogHeader>

				<form
					onSubmit={e => {
						e.preventDefault()
						e.stopPropagation()
						form.handleSubmit()
					}}
					className="space-y-4"
				>
					<form.Field name="url">
						{field => {
							const urlScrapable = isHttpUrl(field.state.value) && !isSublistUrl(field.state.value)
							return (
								<div className="grid gap-2">
									<Label htmlFor={field.name}>URL (optional)</Label>
									<InputGroup>
										<InputGroupInput
											id={field.name}
											type="url"
											placeholder="https://..."
											value={field.state.value}
											onChange={e => field.handleChange(e.target.value)}
											onBlur={() => {
												field.handleBlur()
												triggerAutoScrape(field.state.value)
											}}
											disabled={submitting || scrapeInFlight}
											autoFocus={!isEdit}
											maxLength={LIMITS.URL}
										/>
										<InputGroupAddon align="inline-end">
											<InputGroupButton
												type="button"
												aria-label={scrapeInFlight ? 'Importing from URL…' : 'Import details from URL'}
												title={scrapeInFlight ? 'Importing from URL…' : 'Import details from URL'}
												disabled={!urlScrapable || scrapeInFlight || submitting}
												onClick={() => triggerManualScrape(field.state.value)}
											>
												{scrapeInFlight ? <Loader2 className="animate-spin" /> : <Sparkles />}
											</InputGroupButton>
										</InputGroupAddon>
									</InputGroup>
									<ScrapeProgressAlert
										state={scrapeState}
										url={field.state.value}
										onCancel={cancelScrape}
										onRetry={() => triggerManualScrape(field.state.value)}
										className="mt-1"
									/>
								</div>
							)
						}}
					</form.Field>

					<form.Field name="title">
						{field => (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>Title</Label>
								<Input
									id={field.name}
									name="item-title"
									placeholder="e.g. AirPods Pro"
									value={field.state.value}
									onChange={e => field.handleChange(e.target.value)}
									onBlur={field.handleBlur}
									disabled={formLocked}
									autoFocus={isEdit}
									autoComplete="off"
									data-1p-ignore
									data-lpignore="true"
									maxLength={LIMITS.ITEM_TITLE}
								/>
								{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
									<p className="text-destructive text-sm">
										{field.state.meta.errors.map(e => (typeof e === 'string' ? e : String(e))).join(', ')}
									</p>
								)}
							</div>
						)}
					</form.Field>

					<div className="grid grid-cols-2 gap-4">
						<form.Field name="price">
							{field => (
								<div className="grid gap-2">
									<Label htmlFor={field.name}>Price (optional)</Label>
									<Input
										id={field.name}
										placeholder="29.99"
										inputMode="decimal"
										value={field.state.value}
										onChange={e => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
										disabled={formLocked}
										maxLength={LIMITS.PRICE}
									/>
								</div>
							)}
						</form.Field>

						<form.Field name="quantity">
							{field => (
								<div className="grid gap-2">
									<Label htmlFor={field.name}>Quantity</Label>
									<Input
										id={field.name}
										type="number"
										min={1}
										max={999}
										value={field.state.value}
										onChange={e => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
										disabled={submitting}
									/>
								</div>
							)}
						</form.Field>
					</div>

					<form.Field name="priority">
						{field => (
							<div className="grid gap-2">
								<Label id={`${field.name}-label`}>Priority</Label>
								<ToggleGroup
									type="single"
									variant="outline"
									value={field.state.value}
									onValueChange={v => {
										if (v) field.handleChange(v as typeof field.state.value)
									}}
									disabled={submitting}
									aria-labelledby={`${field.name}-label`}
									className="grid w-full grid-cols-4 sm:flex sm:w-fit"
								>
									{[...priorityEnumValues].reverse().map(p => (
										<ToggleGroupItem
											key={p}
											value={p}
											aria-label={PriorityLabels[p] ?? p}
											className="min-w-0 px-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground"
										>
											{p !== 'normal' && <PriorityIcon priority={p} />}
											<span className={p === 'normal' ? undefined : 'hidden sm:inline'}>{PriorityLabels[p] ?? p}</span>
										</ToggleGroupItem>
									))}
								</ToggleGroup>
							</div>
						)}
					</form.Field>

					<form.Field name="notes">
						{field => (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>Notes (optional)</Label>
								<MarkdownTextarea
									id={field.name}
									placeholder="Color preferences, size, model, etc."
									rows={3}
									value={field.state.value}
									onChange={v => field.handleChange(v)}
									onBlur={field.handleBlur}
									disabled={formLocked}
									maxLength={LIMITS.LONG_TEXT}
								/>
							</div>
						)}
					</form.Field>

					<form.Field name="imageUrl">
						{field => {
							const currentUrl = field.state.value.trim() || null

							const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
								const file = e.target.files?.[0]
								e.target.value = ''
								if (!file || !isEdit) return
								setUploadingImage(true)
								try {
									// Pre-shrink on the client so the request body fits comfortably
									// under the function-runtime limit (Vercel ~4.5 MB on Node, 1 MB
									// on edge). Server still re-processes via Sharp.
									const upload = await resizeImageForUpload(file)
									const formData = new FormData()
									formData.append('file', upload)
									formData.append('itemId', String(props.item.id))
									const result = await uploadItemImage({ data: formData })
									if (result.kind === 'error') {
										toast.error(`Image upload failed: ${result.message}`)
										return
									}
									field.handleChange(result.value.url)
									toast.success('Image uploaded')
								} catch (err) {
									const msg = err instanceof Error ? err.message : 'unknown error'
									toast.error(`Image upload failed: ${msg}`)
								} finally {
									setUploadingImage(false)
								}
							}

							const handleRemove = async () => {
								if (!isEdit || !storageConfigured) {
									field.handleChange('')
									return
								}
								const result = await removeItemImage({ data: { itemId: props.item.id } })
								if (result.kind === 'error') {
									toast.error(`Remove failed: ${result.message}`)
									return
								}
								field.handleChange('')
								toast.success('Image removed')
							}

							return (
								<div className="grid gap-2">
									<Label htmlFor={field.name}>Image (optional)</Label>
									{/* Preview current image if any */}
									{currentUrl && (
										<div className="flex items-center gap-3">
											<img src={currentUrl} alt="" className="size-16 rounded border object-cover" />
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={handleRemove}
												disabled={submitting || uploadingImage}
												className="gap-1.5"
											>
												<Trash2 className="size-3" />
												Remove
											</Button>
										</div>
									)}
									<ImagePicker
										images={imageCandidates}
										value={field.state.value}
										onChange={url => field.handleChange(url)}
										disabled={formLocked || uploadingImage}
									/>
									<div className="flex gap-2">
										<Input
											id={field.name}
											placeholder={showUploadButton ? 'https://... or upload below' : 'https://...'}
											value={field.state.value}
											onChange={e => field.handleChange(e.target.value)}
											onBlur={field.handleBlur}
											disabled={submitting || uploadingImage}
											maxLength={LIMITS.URL}
										/>
										{showUploadButton && (
											<>
												<input type="file" className="hidden" ref={fileInputRef} accept="image/*" onChange={handleFileChange} />
												<Button
													type="button"
													variant="outline"
													onClick={() => fileInputRef.current?.click()}
													disabled={submitting || uploadingImage}
													className="shrink-0 gap-1.5"
												>
													{uploadingImage ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
													Upload
												</Button>
											</>
										)}
									</div>
									{!isEdit && storageConfigured && (
										<p className="text-muted-foreground text-xs">You can upload a file after the item is created.</p>
									)}
								</div>
							)
						}}
					</form.Field>

					{error && (
						<Alert variant="destructive">
							<AlertTitle>{isEdit ? "Couldn't update item" : "Couldn't add item"}</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
							Cancel
						</Button>
						<Button type="submit" disabled={submitting}>
							{submitting ? 'Saving…' : isEdit ? 'Save' : 'Add item'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
