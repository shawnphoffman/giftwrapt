import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { Loader2, Sparkles, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { createItem, updateItem } from '@/api/items'
import { removeItemImage, uploadItemImage } from '@/api/uploads'
import { MarkdownTextarea } from '@/components/common/markdown-textarea'
import PriorityIcon from '@/components/common/priority-icon'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { priorityEnumValues } from '@/db/schema/enums'
import type { Item } from '@/db/schema/items'
import { useStorageStatus } from '@/hooks/use-storage-status'
import { useScrapeUrl } from '@/lib/use-scrape-url'

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
	title: z.string().min(1, 'Title is required').max(500),
	url: z.string().max(2000).optional(),
	price: z.string().max(50).optional(),
	notes: z.string().max(5000).optional(),
	priority: z.enum(priorityEnumValues),
	quantity: z.coerce.number().int().positive('Must be at least 1').max(999),
	imageUrl: z.string().max(2000).optional(),
})

export function ItemFormDialog(props: Props) {
	const { open, onOpenChange } = props
	const isEdit = props.mode === 'edit'
	const router = useRouter()
	const queryClient = useQueryClient()
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [uploadingImage, setUploadingImage] = useState(false)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const { configured: storageConfigured } = useStorageStatus()
	// Upload UI is only offered when the item already exists (itemId required
	// for the upload endpoint) AND storage is configured on the server.
	const showUploadButton = isEdit && storageConfigured

	// Scrape integration. Per-field "did the user touch this?" refs gate
	// prefill so a re-scrape never clobbers user edits. lastScrapedUrlRef
	// stops the blur handler from firing repeatedly on the same URL.
	const { state: scrapeState, start: startScrape, cancel: cancelScrape } = useScrapeUrl()
	const titleTouchedRef = useRef(false)
	const priceTouchedRef = useRef(false)
	const notesTouchedRef = useRef(false)
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

			setSubmitting(true)
			setError(null)
			try {
				if (isEdit) {
					const trimmedUrl = parsed.data.url?.trim() || null
					const trimmedPrice = parsed.data.price?.trim() || null
					const trimmedNotes = parsed.data.notes?.trim() || null
					const trimmedImageUrl = parsed.data.imageUrl?.trim() || null

					const result = await updateItem({
						data: {
							itemId: props.item.id,
							title: parsed.data.title,
							url: trimmedUrl,
							price: trimmedPrice,
							notes: trimmedNotes,
							priority: parsed.data.priority,
							quantity: parsed.data.quantity,
							imageUrl: trimmedImageUrl,
						},
					})

					if (result.kind === 'error') {
						setError(result.reason === 'not-authorized' ? 'You no longer have permission to edit this item.' : 'Item not found.')
						return
					}

					toast.success('Item updated')
				} else {
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
				}

				onOpenChange(false)
				form.reset()
				if (!isEdit) {
					queryClient.invalidateQueries({ queryKey: ['recent', 'items'] })
				}
				await router.invalidate()
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to save item')
			} finally {
				setSubmitting(false)
			}
		},
	})

	// Prefill empty (or untouched) fields when a scrape result arrives. Runs
	// for both `partial` (a winner is in but parallels still racing) and
	// `done` (final winner, possibly title-cleaned by the post-pass).
	useEffect(() => {
		if (scrapeState.phase !== 'partial' && scrapeState.phase !== 'done') return
		const result = scrapeState.result
		if (!result) return
		const values = form.state.values
		if (!titleTouchedRef.current && !values.title.trim() && result.title) {
			form.setFieldValue('title', result.title)
		}
		if (!priceTouchedRef.current && !values.price.trim() && result.price) {
			form.setFieldValue('price', result.price)
		}
		if (!notesTouchedRef.current && !values.notes.trim() && result.description) {
			form.setFieldValue('notes', result.description)
		}
		setImageCandidates(result.imageUrls)
		const firstCandidate = result.imageUrls[0]
		if (!values.imageUrl.trim() && firstCandidate) {
			form.setFieldValue('imageUrl', firstCandidate)
		}
	}, [scrapeState, form])

	// Tear down any in-flight scrape and reset prefill state when the dialog
	// closes. The form itself is reset by callers post-submit; this runs
	// regardless to clean up the side-effect of opening + closing without
	// saving.
	useEffect(() => {
		if (open) return
		cancelScrape()
		titleTouchedRef.current = false
		priceTouchedRef.current = false
		notesTouchedRef.current = false
		lastScrapedUrlRef.current = ''
		setImageCandidates([])
	}, [open, cancelScrape])

	const formLocked = submitting || scrapeState.phase === 'scraping'
	const scrapeInFlight = scrapeState.phase === 'scraping'

	const triggerAutoScrape = (rawUrl: string) => {
		const trimmed = rawUrl.trim()
		if (!isHttpUrl(trimmed)) return
		if (trimmed === lastScrapedUrlRef.current) return
		lastScrapedUrlRef.current = trimmed
		startScrape(trimmed)
	}

	const triggerManualScrape = (rawUrl: string) => {
		const trimmed = rawUrl.trim()
		if (!isHttpUrl(trimmed)) return
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
							const urlScrapable = isHttpUrl(field.state.value)
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
											disabled={submitting}
											autoFocus={!isEdit}
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
									placeholder="e.g. AirPods Pro"
									value={field.state.value}
									onChange={e => {
										titleTouchedRef.current = true
										field.handleChange(e.target.value)
									}}
									onBlur={field.handleBlur}
									disabled={formLocked}
									autoFocus={isEdit}
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
										onChange={e => {
											priceTouchedRef.current = true
											field.handleChange(e.target.value)
										}}
										onBlur={field.handleBlur}
										disabled={formLocked}
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
								<Label htmlFor={field.name}>Priority</Label>
								<Select
									value={field.state.value}
									onValueChange={v => field.handleChange(v as typeof field.state.value)}
									disabled={submitting}
								>
									<SelectTrigger id={field.name}>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{[...priorityEnumValues].reverse().map(p => (
											<SelectItem key={p} value={p}>
												<span className="inline-flex items-center gap-2">
													<span className="inline-flex size-4 items-center justify-center">
														<PriorityIcon priority={p} />
													</span>
													{PriorityLabels[p] ?? p}
												</span>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
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
									onChange={v => {
										notesTouchedRef.current = true
										field.handleChange(v)
									}}
									onBlur={field.handleBlur}
									disabled={formLocked}
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
									const formData = new FormData()
									formData.append('file', file)
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
