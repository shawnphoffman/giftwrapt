import { useForm } from '@tanstack/react-form'
import { useRouter } from '@tanstack/react-router'
import { FileText, Loader2, Truck, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { updateItemGift } from '@/api/gifts'
import { updateListAddon } from '@/api/list-addons'
import { removePurchaseAttachment, uploadPurchaseAttachment } from '@/api/uploads'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useStorageStatus } from '@/hooks/use-storage-status'
import { detectCarrier } from '@/lib/tracking/carriers'
import { LIMITS } from '@/lib/validation/limits'
import { m } from '@/paraglide/messages.js'

export type EditablePurchase =
	| {
			type: 'claim'
			giftId: number
			quantity: number
			totalCost: string | null
			notes: string | null
			trackingNumber: string | null
			attachmentUrls: Array<string> | null
	  }
	| {
			type: 'addon'
			addonId: number
			totalCost: string | null
			notes: string | null
			trackingNumber: string | null
			attachmentUrls: Array<string> | null
	  }

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	purchase: EditablePurchase | null
}

// Built on each submit, not once at module load: the messages are read in the
// language of whoever is submitting.
function purchaseSchema() {
	return z.object({
		totalCost: z
			.string()
			.trim()
			.optional()
			.refine(v => !v || /^\d+(\.\d{1,2})?$/.test(v), {
				message: m.purchases_edit_cost_invalid(),
			}),
		notes: z.string().max(LIMITS.MEDIUM_TEXT, m.purchases_edit_too_long()).optional(),
		trackingNumber: z.string().max(LIMITS.TRACKING_NUMBER, m.purchases_edit_too_long()).optional(),
	})
}

function getErrorMessage(errors: Array<unknown>): string {
	return errors
		.map(err => {
			if (typeof err === 'string') return err
			if (err && typeof err === 'object' && 'message' in err) return (err as { message: string }).message
			return String(err)
		})
		.join(', ')
}

export function PurchaseEditDialog({ open, onOpenChange, purchase }: Props) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				{purchase && <PurchaseEditForm key={purchaseFormKey(purchase)} purchase={purchase} onOpenChange={onOpenChange} />}
			</DialogContent>
		</Dialog>
	)
}

function purchaseFormKey(p: EditablePurchase): string {
	return p.type === 'claim' ? `claim-${p.giftId}` : `addon-${p.addonId}`
}

function PurchaseEditForm({ purchase, onOpenChange }: { purchase: EditablePurchase; onOpenChange: (open: boolean) => void }) {
	const router = useRouter()
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const { configured: storageConfigured } = useStorageStatus()
	const [attachments, setAttachments] = useState<Array<string>>(purchase.attachmentUrls ?? [])
	const [attachmentBusy, setAttachmentBusy] = useState(false)
	const fileInputRef = useRef<HTMLInputElement>(null)

	const purchaseKind: 'claim' | 'addon' = purchase.type
	const purchaseId = purchase.type === 'claim' ? purchase.giftId : purchase.addonId

	const form = useForm({
		defaultValues: {
			totalCost: purchase.totalCost ?? '',
			notes: purchase.notes ?? '',
			trackingNumber: purchase.trackingNumber ?? '',
		},
		onSubmit: async ({ value }) => {
			const parsed = purchaseSchema().safeParse(value)
			if (!parsed.success) {
				setError(parsed.error.issues.map(e => e.message).join(', '))
				return
			}

			const trimmedCost = parsed.data.totalCost?.trim() ?? ''
			const trimmedNotes = parsed.data.notes?.trim() ?? ''
			const trimmedTracking = parsed.data.trackingNumber?.trim() ?? ''

			setSubmitting(true)
			setError(null)

			try {
				if (purchase.type === 'claim') {
					const result = await updateItemGift({
						data: {
							giftId: purchase.giftId,
							quantity: purchase.quantity,
							notes: trimmedNotes ? trimmedNotes : null,
							totalCost: trimmedCost ? trimmedCost : null,
							trackingNumber: trimmedTracking ? trimmedTracking : null,
						},
					})

					if (result.kind === 'error') {
						switch (result.reason) {
							case 'not-yours':
								setError(m.purchases_edit_error_claim_not_yours())
								break
							case 'not-found':
								setError(m.purchases_edit_error_claim_gone())
								break
							case 'over-claim':
								setError(m.purchases_edit_error_over_claim())
								break
						}
						return
					}
				} else {
					const result = await updateListAddon({
						data: {
							addonId: purchase.addonId,
							notes: trimmedNotes ? trimmedNotes : null,
							totalCost: trimmedCost ? trimmedCost : null,
							trackingNumber: trimmedTracking ? trimmedTracking : null,
						},
					})

					if (result.kind === 'error') {
						switch (result.reason) {
							case 'not-yours':
								setError(m.purchases_edit_error_addon_not_yours())
								break
							case 'not-found':
								setError(m.purchases_edit_error_addon_gone())
								break
						}
						return
					}
				}

				toast.success(m.purchases_edit_saved())
				onOpenChange(false)
				await router.invalidate()
			} catch (err) {
				setError(err instanceof Error ? err.message : m.purchases_edit_save_failed())
			} finally {
				setSubmitting(false)
			}
		},
	})

	async function handleFiles(files: FileList | null) {
		if (!files || files.length === 0) return
		setAttachmentBusy(true)
		try {
			for (const file of Array.from(files)) {
				if (attachments.length >= LIMITS.PURCHASE_ATTACHMENTS_MAX) {
					toast.error(m.purchases_edit_attachments_max({ max: LIMITS.PURCHASE_ATTACHMENTS_MAX }))
					break
				}
				const fd = new FormData()
				fd.append('file', file)
				fd.append('purchaseKind', purchaseKind)
				fd.append('purchaseId', String(purchaseId))
				const result = await uploadPurchaseAttachment({ data: fd })
				if (result.kind === 'error') {
					toast.error(result.message)
					break
				}
				setAttachments(prev => [...prev, result.value.url])
			}
			await router.invalidate()
		} finally {
			setAttachmentBusy(false)
			if (fileInputRef.current) fileInputRef.current.value = ''
		}
	}

	async function handleRemoveAttachment(url: string) {
		// Optimistic remove; revert on error.
		const prev = attachments
		setAttachments(prev.filter(u => u !== url))
		const result = await removePurchaseAttachment({
			data: { purchaseKind, purchaseId, attachmentUrl: url },
		})
		if (result.kind === 'error') {
			setAttachments(prev)
			toast.error(result.message)
			return
		}
		await router.invalidate()
	}

	const atCap = attachments.length >= LIMITS.PURCHASE_ATTACHMENTS_MAX

	return (
		<>
			<DialogHeader>
				<DialogTitle>{m.purchases_edit_title()}</DialogTitle>
				<DialogDescription>{m.purchases_edit_description()}</DialogDescription>
			</DialogHeader>

			<form
				onSubmit={e => {
					e.preventDefault()
					e.stopPropagation()
					form.handleSubmit()
				}}
				className="space-y-4"
			>
				<form.Field name="totalCost">
					{field => (
						<div className="grid gap-2">
							<Label htmlFor={field.name}>{m.purchases_edit_cost_label()}</Label>
							<div className="relative">
								<span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">$</span>
								<Input
									id={field.name}
									type="text"
									inputMode="decimal"
									placeholder="0.00"
									className="pl-7"
									value={field.state.value}
									onChange={e => field.handleChange(e.target.value)}
									onBlur={field.handleBlur}
									disabled={submitting}
									maxLength={LIMITS.PRICE}
								/>
							</div>
							{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
								<p className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</p>
							)}
						</div>
					)}
				</form.Field>

				<form.Field name="trackingNumber">
					{field => {
						const match = detectCarrier(field.state.value)
						return (
							<div className="grid gap-2">
								<Label htmlFor={field.name}>{m.purchases_edit_tracking_label()}</Label>
								<div className="relative">
									<Truck className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-4 pointer-events-none" />
									<Input
										id={field.name}
										type="text"
										placeholder={m.purchases_edit_tracking_placeholder()}
										className="pl-9"
										value={field.state.value}
										onChange={e => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
										disabled={submitting}
										maxLength={LIMITS.TRACKING_NUMBER}
									/>
								</div>
								{match.carrierName && (
									<div className="text-xs text-muted-foreground">
										{m.purchases_edit_tracking_looks_like()} <Badge variant="secondary">{match.carrierName}</Badge>
									</div>
								)}
								{field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
									<p className="text-destructive text-sm">{getErrorMessage(field.state.meta.errors)}</p>
								)}
							</div>
						)
					}}
				</form.Field>

				<form.Field name="notes">
					{field => (
						<div className="grid gap-2">
							<Label htmlFor={field.name}>{m.purchases_edit_notes_label()}</Label>
							<Textarea
								id={field.name}
								placeholder={m.purchases_edit_notes_placeholder()}
								rows={3}
								value={field.state.value}
								onChange={e => field.handleChange(e.target.value)}
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

				<AttachmentsSection
					attachments={attachments}
					storageConfigured={storageConfigured}
					busy={attachmentBusy}
					atCap={atCap}
					disabled={submitting}
					fileInputRef={fileInputRef}
					onPickFiles={handleFiles}
					onRemove={handleRemoveAttachment}
				/>

				{error && (
					<Alert variant="destructive">
						<AlertTitle>{m.purchases_edit_error_title()}</AlertTitle>
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
						{m.action_cancel()}
					</Button>
					<Button type="submit" disabled={submitting}>
						{submitting ? m.state_saving() : m.action_save()}
					</Button>
				</DialogFooter>
			</form>
		</>
	)
}

function AttachmentsSection({
	attachments,
	storageConfigured,
	busy,
	atCap,
	disabled,
	fileInputRef,
	onPickFiles,
	onRemove,
}: {
	attachments: Array<string>
	storageConfigured: boolean
	busy: boolean
	atCap: boolean
	disabled: boolean
	fileInputRef: React.RefObject<HTMLInputElement | null>
	onPickFiles: (files: FileList | null) => void
	onRemove: (url: string) => void
}) {
	// Hide entirely when storage is off and there's nothing to render.
	if (!storageConfigured && attachments.length === 0) return null

	return (
		<div className="grid gap-2">
			<div className="flex items-center justify-between">
				<Label>{m.purchases_edit_attachments_label()}</Label>
				<span className="text-xs text-muted-foreground">
					{attachments.length}/{LIMITS.PURCHASE_ATTACHMENTS_MAX}
				</span>
			</div>
			<p className="text-xs text-muted-foreground">{m.purchases_edit_attachments_help()}</p>
			{attachments.length > 0 && (
				<div className="grid grid-cols-3 gap-2">
					{attachments.map(url => (
						<AttachmentTile key={url} url={url} disabled={disabled || !storageConfigured} onRemove={() => onRemove(url)} />
					))}
				</div>
			)}
			{storageConfigured ? (
				<>
					<input
						ref={fileInputRef}
						type="file"
						accept="image/*,application/pdf"
						multiple
						className="hidden"
						onChange={e => onPickFiles(e.target.files)}
					/>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="w-fit"
						onClick={() => fileInputRef.current?.click()}
						disabled={disabled || busy || atCap}
					>
						{busy ? <Loader2 className="size-4 animate-spin" /> : null}
						{atCap ? m.purchases_edit_attachments_max_reached() : m.purchases_edit_attachments_add()}
					</Button>
				</>
			) : (
				<p className="text-xs text-muted-foreground italic">{m.purchases_edit_uploads_disabled()}</p>
			)}
		</div>
	)
}

function AttachmentTile({ url, disabled, onRemove }: { url: string; disabled: boolean; onRemove: () => void }) {
	const isPdf = url.toLowerCase().endsWith('.pdf')
	return (
		<div className="relative group rounded border bg-muted overflow-hidden aspect-square">
			{isPdf ? (
				<a
					href={url}
					target="_blank"
					rel="noopener noreferrer"
					className="flex flex-col items-center justify-center size-full text-xs text-muted-foreground hover:bg-muted/70"
				>
					<FileText className="size-8 mb-1" />
					<span className="px-2 truncate w-full text-center">PDF</span>
				</a>
			) : (
				<a href={url} target="_blank" rel="noopener noreferrer" className="block size-full">
					<img src={url} alt={m.purchases_edit_attachment_alt()} className="size-full object-cover" />
				</a>
			)}
			{!disabled && (
				<button
					type="button"
					onClick={onRemove}
					className="absolute top-1 right-1 rounded-full bg-background/90 text-foreground p-0.5 can-hover:opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
					aria-label={m.purchases_edit_attachment_remove()}
				>
					<X className="size-3.5" />
				</button>
			)}
		</div>
	)
}
