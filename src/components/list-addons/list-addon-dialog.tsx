import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { DollarSign, Loader2, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { copyGiftIdeaToAddon } from '@/api/gift-ideas'
import { createListAddon, updateListAddon } from '@/api/list-addons'
import type { AddonOnList } from '@/api/lists'
import { getCachedScrapeImages } from '@/api/scraper'
import { MarkdownTextarea } from '@/components/common/markdown-textarea'
import { ImagePicker } from '@/components/items/image-picker'
import { ScrapeProgressAlert } from '@/components/items/scrape-progress-alert'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { httpsUpgrade } from '@/lib/image-url'
import { applyListEventLocally } from '@/lib/list-events'
import { applyScrapePrefill } from '@/lib/scrapers/apply-prefill'
import { normalizeHttpUrl } from '@/lib/urls'
import { useScrapeUrl } from '@/lib/use-scrape-url'
import { LIMITS } from '@/lib/validation/limits'

export type ListAddonInitialValues = Partial<{
	description: string
	notes: string
	totalCost: string
	url: string
	imageUrl: string
}>

type BaseProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	listId: number
}

type CreateProps = BaseProps & {
	mode?: 'create'
	addon?: never
	// Prefills the form. A prefilled URL counts as already scraped: it never
	// auto-scrapes on open or first blur, but its cached scrape images are
	// offered in the picker.
	initialValues?: ListAddonInitialValues
	// Claiming a gift idea: submitting copies the idea into this off-list gift
	// and deletes the idea (server-side, one transaction). Pair with
	// `initialValues` prefilled from the idea.
	fromIdea?: { ideaItemId: number }
}
type EditProps = BaseProps & { mode: 'edit'; addon: AddonOnList; initialValues?: never; fromIdea?: never }

type Props = CreateProps | EditProps

const schema = z.object({
	url: z.string().max(LIMITS.URL).optional(),
	description: z.string().min(1, 'Description is required').max(LIMITS.SHORT_TEXT, 'Too long'),
	notes: z.string().max(LIMITS.MEDIUM_TEXT, 'Too long').optional(),
	totalCost: z
		.string()
		.trim()
		.optional()
		.refine(v => !v || /^\d+(\.\d{1,2})?$/.test(v), {
			message: 'Must be a number like 12.50',
		}),
	imageUrl: z.string().max(LIMITS.URL).optional(),
})

function getErrorMessage(errors: Array<unknown>): string {
	return errors
		.map(err => {
			if (typeof err === 'string') return err
			if (err && typeof err === 'object' && 'message' in err) return (err as { message: string }).message
			return String(err)
		})
		.join(', ')
}

export function ListAddonDialog(props: Props) {
	const { open, onOpenChange, listId } = props
	const isEdit = props.mode === 'edit'
	const fromIdea = props.mode === 'edit' ? undefined : props.fromIdea
	const router = useRouter()
	const queryClient = useQueryClient()
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const initial: ListAddonInitialValues = isEdit
		? {
				description: props.addon.description,
				notes: props.addon.notes ?? '',
				totalCost: props.addon.totalCost ?? '',
				url: props.addon.url ?? '',
				imageUrl: props.addon.imageUrl ?? '',
			}
		: (props.initialValues ?? {})

	// Scrape integration, mirroring the item form. lastScrapedUrlRef stops the
	// blur handler from re-firing while the URL is unchanged; the Sparkles
	// button always forces. Only the description and image are prefilled from
	// a scrape: Total cost is what the gifter paid, not the listed price.
	const { state: scrapeState, start: startScrape, cancel: cancelScrape } = useScrapeUrl()
	const lastScrapedUrlRef = useRef('')
	const lastScrapeAppliedRef = useRef<Partial<{ description: string; imageUrl: string }>>({})
	const cacheSeededForUrlRef = useRef<string | null>(null)
	const [imageCandidates, setImageCandidates] = useState<ReadonlyArray<string>>([])

	const form = useForm({
		defaultValues: {
			url: initial.url ?? '',
			description: initial.description ?? '',
			notes: initial.notes ?? '',
			totalCost: initial.totalCost ?? '',
			imageUrl: initial.imageUrl ?? '',
		},
		onSubmit: async ({ value }) => {
			const parsed = schema.safeParse(value)
			if (!parsed.success) {
				setError(parsed.error.issues.map(e => e.message).join(', '))
				return
			}

			const url = normalizeHttpUrl(parsed.data.url) ?? (parsed.data.url?.trim() || null)
			const imageUrl = parsed.data.imageUrl?.trim() || null
			const notes = parsed.data.notes?.trim() || null
			const totalCost = parsed.data.totalCost?.trim() || null

			setSubmitting(true)
			setError(null)
			try {
				if (isEdit) {
					const result = await updateListAddon({
						data: {
							addonId: props.addon.id,
							description: parsed.data.description.trim(),
							notes,
							totalCost,
							url,
							imageUrl,
						},
					})

					if (result.kind === 'error') {
						switch (result.reason) {
							case 'not-yours':
								setError("You can't edit someone else's addon.")
								break
							case 'not-found':
								setError('This addon no longer exists.')
								break
						}
						return
					}

					toast.success('Off-list gift updated')
				} else {
					const data = {
						listId,
						description: parsed.data.description.trim(),
						notes: notes ?? undefined,
						totalCost: totalCost ?? undefined,
						url: url ?? undefined,
						imageUrl: imageUrl ?? undefined,
					}
					const result = fromIdea
						? await copyGiftIdeaToAddon({ data: { ...data, ideaItemId: fromIdea.ideaItemId } })
						: await createListAddon({ data })

					if (result.kind === 'error') {
						switch (result.reason) {
							case 'idea-not-found':
							case 'idea-already-used':
								// Someone else got to it first. Close and refresh so it drops out.
								toast.error('This idea was already used.')
								applyListEventLocally({ kind: 'addon', listId, addonId: 0 }, { queryClient, router })
								onOpenChange(false)
								break
							case 'not-allowed':
								setError('You can no longer edit that gift-ideas list.')
								break
							case 'not-visible':
								setError('You no longer have access to this list.')
								break
							case 'cannot-add-to-own-list':
								setError("You can't add off-list gifts to your own list.")
								break
							case 'list-not-found':
								setError('This list no longer exists.')
								break
						}
						return
					}

					toast.success(fromIdea ? 'Idea claimed' : 'Off-list gift added')
				}

				// Refresh the actor's own surfaces immediately. The gifter list view
				// renders addons via listAddonsQueryOptions (React Query), which
				// router.invalidate alone wouldn't touch; SSE only reaches it on a
				// shared-process host, not Vercel.
				applyListEventLocally({ kind: 'addon', listId, addonId: isEdit ? props.addon.id : 0 }, { queryClient, router })
				onOpenChange(false)
				form.reset()
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to save')
			} finally {
				setSubmitting(false)
			}
		},
	})

	// Shared "fill if empty" rule (see applyScrapePrefill), limited to the
	// description (from the scraped title) and the image.
	useEffect(() => {
		if (scrapeState.phase !== 'partial' && scrapeState.phase !== 'done') return
		const result = scrapeState.result
		if (!result) return
		const values = form.state.values
		const applied = lastScrapeAppliedRef.current
		const update = applyScrapePrefill({ title: values.description, price: '', notes: '', imageUrl: values.imageUrl }, result, {
			title: applied.description,
			imageUrl: applied.imageUrl,
		})
		if (update.title !== undefined) {
			form.setFieldValue('description', update.title.slice(0, LIMITS.SHORT_TEXT))
			applied.description = update.title.slice(0, LIMITS.SHORT_TEXT)
		}
		if (update.imageUrl !== undefined) {
			form.setFieldValue('imageUrl', update.imageUrl)
			applied.imageUrl = update.imageUrl
		}
		setImageCandidates(update.imageCandidates)
	}, [scrapeState, form])

	// On open, treat any existing/prefilled URL as already scraped so an
	// unchanged URL never auto-scrapes; on close, tear down scrape state.
	const initialUrl = (initial.url ?? '').trim()
	useEffect(() => {
		if (open) {
			lastScrapedUrlRef.current = initialUrl
			return
		}
		cancelScrape()
		lastScrapedUrlRef.current = ''
		lastScrapeAppliedRef.current = {}
		cacheSeededForUrlRef.current = null
		setImageCandidates([])
	}, [open, initialUrl, cancelScrape])

	// Cache-only lookup of the images the initial URL was scraped with, so they
	// can be re-picked for free (same as the item edit dialog).
	useEffect(() => {
		if (!open || !initialUrl) return
		if (cacheSeededForUrlRef.current === initialUrl) return
		cacheSeededForUrlRef.current = initialUrl
		let cancelled = false
		void getCachedScrapeImages({ data: { url: initialUrl } })
			.then(res => {
				if (cancelled || res.kind !== 'ok' || res.imageUrls.length === 0) return
				setImageCandidates(prev => (prev.length > 0 ? prev : res.imageUrls))
			})
			.catch(() => {
				// Best-effort: a failed cache lookup just leaves the picker as-is.
			})
		return () => {
			cancelled = true
		}
	}, [open, initialUrl])

	const scrapeInFlight = scrapeState.phase === 'scraping'
	const formLocked = submitting || scrapeInFlight

	const triggerAutoScrape = (rawUrl: string) => {
		const normalized = normalizeHttpUrl(rawUrl)
		if (!normalized) return
		if (normalized !== rawUrl) form.setFieldValue('url', normalized)
		if (normalized === lastScrapedUrlRef.current) return
		lastScrapedUrlRef.current = normalized
		startScrape(normalized)
	}

	const triggerManualScrape = (rawUrl: string) => {
		const normalized = normalizeHttpUrl(rawUrl)
		if (!normalized) return
		if (normalized !== rawUrl) form.setFieldValue('url', normalized)
		lastScrapedUrlRef.current = normalized
		startScrape(normalized, { force: true })
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{isEdit ? 'Edit off-list gift' : fromIdea ? 'Claim idea' : 'Add off-list gift'}</DialogTitle>
					<DialogDescription>
						{isEdit
							? 'Update the details of your off-list gift. The list owner won’t see this.'
							: fromIdea
								? "Claiming adds this to Off-List Gifts on this list so other gifters know you've got it, and removes it from your ideas. The list owner won't see it."
								: "Record something you're gifting that isn't on the list. The list owner won't see this, just other viewers."}
					</DialogDescription>
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
							const urlScrapable = normalizeHttpUrl(field.state.value) !== null
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

					<form.Field name="description">
						{field => (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>What is it?</Label>
								<Input
									id={field.name}
									type="text"
									placeholder='e.g. "Matching scarf from Nordstrom"'
									value={field.state.value}
									onChange={e => field.handleChange(e.target.value)}
									onBlur={field.handleBlur}
									disabled={formLocked}
									maxLength={LIMITS.SHORT_TEXT}
								/>
								{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
									<p className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</p>
								)}
							</div>
						)}
					</form.Field>

					<form.Field name="totalCost">
						{field => (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>Total cost (optional)</Label>
								<div className="relative">
									<DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
									<Input
										id={field.name}
										type="number"
										inputMode="decimal"
										min="0"
										step="0.01"
										placeholder="0.00"
										value={field.state.value}
										onChange={e => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
										disabled={submitting}
										className="pl-8"
									/>
								</div>
								{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
									<p className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</p>
								)}
							</div>
						)}
					</form.Field>

					<form.Field name="notes">
						{field => (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>Notes (optional)</Label>
								<MarkdownTextarea
									id={field.name}
									placeholder="e.g. already ordered, arrives Friday"
									rows={3}
									value={field.state.value}
									onChange={v => field.handleChange(v)}
									onBlur={field.handleBlur}
									disabled={submitting}
									maxLength={LIMITS.MEDIUM_TEXT}
								/>
								{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
									<p className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</p>
								)}
							</div>
						)}
					</form.Field>

					<form.Field name="imageUrl">
						{field => {
							const currentUrl = field.state.value.trim() || null
							return (
								<div className="grid gap-2">
									<Label htmlFor={field.name}>Image (optional)</Label>
									{currentUrl && (
										<div className="flex items-center gap-3">
											<img src={httpsUpgrade(currentUrl)} alt="" className="size-16 rounded border object-cover" />
											<Button
												type="button"
												variant="outline"
												size="sm"
												onClick={() => field.handleChange('')}
												disabled={submitting}
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
										disabled={formLocked}
									/>
									<Input
										id={field.name}
										placeholder="https://..."
										value={field.state.value}
										onChange={e => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
										disabled={submitting}
										maxLength={LIMITS.URL}
									/>
								</div>
							)
						}}
					</form.Field>

					{error && (
						<Alert variant="destructive">
							<AlertTitle>{isEdit ? "Couldn't update" : "Couldn't save"}</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
							Cancel
						</Button>
						<Button type="submit" disabled={submitting}>
							{submitting ? 'Saving…' : isEdit ? 'Save' : fromIdea ? 'Claim' : 'Add'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
