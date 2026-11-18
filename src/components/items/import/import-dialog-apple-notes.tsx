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
import { errorText } from '@/lib/i18n/errors'
import { parseAppleNotes } from '@/lib/import/parsers/apple-notes'
import { itemsKeys } from '@/lib/queries/items'
import { m } from '@/paraglide/messages.js'

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
			toast.success(m.items_import_toast_imported({ count: result.items.length }))
			await queryClient.invalidateQueries({ queryKey: itemsKeys.byList(listId) })
			onOpenChange(false)
		} catch (err) {
			setError(errorText(err, m.items_import_error_failed()))
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Apple className="size-5" /> {m.items_import_apple_title()}
					</DialogTitle>
					<DialogDescription>{m.items_import_apple_description()}</DialogDescription>
				</DialogHeader>

				{step === 'input' ? (
					<div className="flex flex-col gap-3">
						<div className="grid gap-2">
							<Label htmlFor="import-apple-textarea">{m.items_import_apple_label()}</Label>
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
								placeholder={m.items_import_apple_placeholder()}
								autoFocus
							/>
							<div className="text-xs text-muted-foreground">
								{htmlValue
									? m.items_import_apple_detected_rich({ count: previewCount })
									: m.items_import_apple_detected({ count: previewCount })}
							</div>
						</div>
						{error && (
							<Alert variant="destructive">
								<AlertTitle>{m.items_error_title()}</AlertTitle>
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
								{m.action_cancel()}
							</Button>
							<Button type="button" onClick={goToPreview} disabled={previewCount === 0}>
								{m.items_import_preview_button({ count: previewCount })}
							</Button>
						</DialogFooter>
					</div>
				) : (
					<div className="flex flex-col gap-3">
						{error && (
							<Alert variant="destructive">
								<AlertTitle>{m.items_error_title()}</AlertTitle>
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
						/>
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}

function reasonToMessage(reason: 'list-not-found' | 'not-authorized' | 'feature-disabled' | 'todo-list-rejects-items'): string {
	if (reason === 'list-not-found') return m.items_error_list_not_found()
	if (reason === 'not-authorized') return m.items_import_error_not_authorized()
	if (reason === 'todo-list-rejects-items') return m.items_import_error_todo_list()
	return m.items_import_error_disabled()
}
