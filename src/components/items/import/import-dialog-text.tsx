import { useQueryClient } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { bulkCreateItems, extractItemsFromText, type ExtractItemsFromTextResult, type ItemDraft } from '@/api/import'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { errorText } from '@/lib/i18n/errors'
import { formatNumber } from '@/lib/i18n/format'
import { MAX_PASTE_CHARS } from '@/lib/paste-items/prompt'
import { itemsKeys } from '@/lib/queries/items'
import { m } from '@/paraglide/messages.js'

import { ImportPreviewTable } from './import-preview-table'

type Props = {
	listId: number
	open: boolean
	onOpenChange: (open: boolean) => void
}

type Step = 'input' | 'preview'

type ExtractError = Extract<ExtractItemsFromTextResult, { kind: 'error' }>['reason']

// A function, not a table: a table would be built once at module load, in
// whatever language was current then.
function extractErrorMessage(reason: ExtractError): string {
	switch (reason) {
		case 'feature-disabled':
			return m.items_import_text_error_disabled()
		case 'not-configured':
			return m.items_import_text_error_not_configured()
		case 'ai-budget-exceeded':
			return m.items_import_text_error_budget()
		case 'ai-failed':
			return m.items_import_text_error_ai_failed()
		case 'rate-limited':
			return m.items_import_text_error_rate_limited()
	}
}

/**
 * Two-step "Paste Text" import: the user pastes any free text (a
 * notes-app list, a message from a relative), one AI call turns it into
 * drafts, and the same preview table as the other import sources lets
 * them fix or drop rows before anything is created. Only shown when the
 * admin has turned `aiPasteToItemsEnabled` on.
 */
export function ImportDialogText({ listId, open, onOpenChange }: Props) {
	const queryClient = useQueryClient()
	const [step, setStep] = useState<Step>('input')
	const [textValue, setTextValue] = useState('')
	const [drafts, setDrafts] = useState<Array<ItemDraft>>([])
	const [selected, setSelected] = useState<Set<number>>(new Set())
	const [reading, setReading] = useState(false)
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!open) {
			setStep('input')
			setTextValue('')
			setDrafts([])
			setSelected(new Set())
			setReading(false)
			setSubmitting(false)
			setError(null)
		}
	}, [open])

	const trimmed = textValue.trim()
	const tooLong = trimmed.length > MAX_PASTE_CHARS

	const read = async () => {
		setReading(true)
		setError(null)
		try {
			const result = await extractItemsFromText({ data: { text: trimmed } })
			if (result.kind === 'error') {
				setError(extractErrorMessage(result.reason))
				return
			}
			if (result.items.length === 0) {
				setError(m.items_import_text_error_nothing_found())
				return
			}
			setDrafts(result.items)
			setSelected(new Set())
			setStep('preview')
		} catch {
			setError(m.items_import_text_error_ai_failed())
		} finally {
			setReading(false)
		}
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
						<Sparkles className="size-5" /> {m.items_import_text_title()}
					</DialogTitle>
					<DialogDescription>{m.items_import_text_description()}</DialogDescription>
				</DialogHeader>

				{step === 'input' ? (
					<div className="flex flex-col gap-3">
						<div className="grid gap-2">
							<Label htmlFor="import-text-textarea">{m.items_import_text_label()}</Label>
							<Textarea
								id="import-text-textarea"
								rows={10}
								value={textValue}
								onChange={e => setTextValue(e.target.value)}
								placeholder={m.items_import_text_placeholder()}
								disabled={reading}
								autoFocus
							/>
							<div className={tooLong ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
								{tooLong
									? m.items_import_text_chars_too_long({ used: formatNumber(trimmed.length), max: formatNumber(MAX_PASTE_CHARS) })
									: m.items_import_text_chars({ used: formatNumber(trimmed.length), max: formatNumber(MAX_PASTE_CHARS) })}
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
							<Button type="button" onClick={read} disabled={trimmed.length === 0 || tooLong || reading}>
								{reading ? m.items_import_text_reading() : m.items_import_text_find_button()}
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
