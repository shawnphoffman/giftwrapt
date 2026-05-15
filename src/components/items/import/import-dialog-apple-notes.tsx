import { useQueryClient } from '@tanstack/react-query'
import { Apple } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { bulkCreateItems, type ItemDraft } from '@/api/import'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { parseAppleNotes } from '@/lib/import/parsers/apple-notes'
import { itemsKeys } from '@/lib/queries/items'

import { ImportPreviewTable } from './import-preview-table'

type Props = {
	listId: number
	open: boolean
	onOpenChange: (open: boolean) => void
}

type Step = 'input' | 'preview'

/**
 * Two-step Apple Notes import dialog.
 *
 * Apple Notes pastes carry both `text/plain` and `text/html` on the
 * clipboard. We capture the HTML on paste so bullet structure +
 * <a href> URLs survive into the parser; if the clipboard didn't
 * carry HTML (rare; e.g. paste from a different app), we fall back to
 * the textarea's plain value. The same `parseAppleNotes` parser handles
 * both shapes via a leading-`<` heuristic.
 */
export function ImportDialogAppleNotes({ listId, open, onOpenChange }: Props) {
	const queryClient = useQueryClient()
	const [step, setStep] = useState<Step>('input')
	const [textValue, setTextValue] = useState('')
	// `htmlValue` wins over the textarea content if it's set; this lets us
	// keep <a href> intact while still showing the user the plain-text
	// version they recognize.
	const [htmlValue, setHtmlValue] = useState<string | null>(null)
	const [drafts, setDrafts] = useState<Array<ItemDraft>>([])
	const [selected, setSelected] = useState<Set<number>>(new Set())
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const textareaRef = useRef<HTMLTextAreaElement>(null)

	useEffect(() => {
		if (!open) {
			setStep('input')
			setTextValue('')
			setHtmlValue(null)
			setDrafts([])
			setSelected(new Set())
			setSubmitting(false)
			setError(null)
		}
	}, [open])

	const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
		const html = e.clipboardData.getData('text/html')
		if (html && html.length > 0) {
			setHtmlValue(html)
			// Don't preventDefault; let the textarea show the plain-text
			// version so the user can still see what they pasted.
		} else {
			// Plain paste: clear any stale HTML from a previous paste.
			setHtmlValue(null)
		}
	}

	const previewCount = useMemo(() => parseAppleNotes(htmlValue ?? textValue).length, [htmlValue, textValue])

	const goToPreview = () => {
		const parsed = parseAppleNotes(htmlValue ?? textValue)
		setDrafts(parsed)
		setSelected(new Set())
		setStep('preview')
	}

	const submit = async () => {
		if (drafts.length === 0) return
		setSubmitting(true)
		setError(null)
		try {
			const result = await bulkCreateItems({ data: { listId, items: drafts } })
			if (result.kind === 'error') {
				setError(reasonToMessage(result.reason))
				return
			}
			toast.success(`Imported ${result.items.length} item${result.items.length === 1 ? '' : 's'}`)
			await queryClient.invalidateQueries({ queryKey: itemsKeys.byList(listId) })
			onOpenChange(false)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to import')
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Apple className="size-5" /> Import from Apple Notes
					</DialogTitle>
					<DialogDescription>
						Paste a checklist or bulleted list from Apple Notes. Bullet glyphs are stripped automatically; URLs become item links.
					</DialogDescription>
				</DialogHeader>

				{step === 'input' ? (
					<div className="flex flex-col gap-3">
						<div className="grid gap-2">
							<Label htmlFor="import-apple-textarea">Paste from Apple Notes</Label>
							<Textarea
								ref={textareaRef}
								id="import-apple-textarea"
								rows={10}
								value={textValue}
								onChange={e => {
									setTextValue(e.target.value)
									// Hand-edits invalidate any captured HTML; otherwise typing
									// would have no effect on the preview count.
									if (htmlValue !== null) setHtmlValue(null)
								}}
								onPaste={handlePaste}
								placeholder={'• Bluetooth headphones\n• Coffee grinder https://example.com/grinder\n• ...'}
								autoFocus
							/>
							<div className="text-xs text-muted-foreground">
								{previewCount} item{previewCount === 1 ? '' : 's'} detected.
								{htmlValue ? ' (rich-text paste detected)' : ''}
							</div>
						</div>
						{error && (
							<Alert variant="destructive">
								<AlertTitle>Error</AlertTitle>
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
								Cancel
							</Button>
							<Button type="button" onClick={goToPreview} disabled={previewCount === 0}>
								Preview {previewCount} Item{previewCount === 1 ? '' : 's'}
							</Button>
						</DialogFooter>
					</div>
				) : (
					<div className="flex flex-col gap-3">
						{error && (
							<Alert variant="destructive">
								<AlertTitle>Error</AlertTitle>
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						<ImportPreviewTable
							drafts={drafts}
							onChange={setDrafts}
							selected={selected}
							onSelectedChange={setSelected}
							submitting={submitting}
							onSubmit={submit}
							onCancel={() => setStep('input')}
							importLabel="Import"
						/>
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}

function reasonToMessage(reason: 'list-not-found' | 'not-authorized' | 'feature-disabled'): string {
	if (reason === 'list-not-found') return 'List not found.'
	if (reason === 'not-authorized') return 'You do not have permission to add to this list.'
	return 'Importing is currently disabled. Ask your admin to turn it on.'
}
