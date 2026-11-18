import { useQueryClient } from '@tanstack/react-query'
import { Link2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { bulkCreateItems, type ItemDraft } from '@/api/import'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { parseUrls } from '@/lib/import/parsers/urls'
import { itemsKeys } from '@/lib/queries/items'
import { m } from '@/paraglide/messages.js'

import { ImportPreviewTable } from './import-preview-table'

type Props = {
	listId: number
	open: boolean
	onOpenChange: (open: boolean) => void
}

type Step = 'input' | 'preview'

// Shows the expected shape of what to paste; not translated.
const URLS_PLACEHOLDER = 'https://www.example.com/product-1\nhttps://shop.example.com/another\n...'

/**
 * Two-step paste-URLs import dialog. The user pastes one URL per line,
 * we run the pure `parseUrls` parser client-side to produce drafts,
 * the preview table lets them tidy up, and submit calls
 * `bulkCreateItems`. Imported URL-only items render with hostname
 * placeholder titles until the background scrape queue fills them in;
 * the per-list SSE channel pushes those updates to the edit page.
 */
export function ImportDialogUrls({ listId, open, onOpenChange }: Props) {
	const queryClient = useQueryClient()
	const [step, setStep] = useState<Step>('input')
	const [textValue, setTextValue] = useState('')
	const [drafts, setDrafts] = useState<Array<ItemDraft>>([])
	const [selected, setSelected] = useState<Set<number>>(new Set())
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!open) {
			setStep('input')
			setTextValue('')
			setDrafts([])
			setSelected(new Set())
			setSubmitting(false)
			setError(null)
		}
	}, [open])

	const previewCount = useMemo(() => parseUrls(textValue).length, [textValue])

	const goToPreview = () => {
		const parsed = parseUrls(textValue)
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
			setError(err instanceof Error ? err.message : m.items_import_error_failed())
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Link2 className="size-5" /> {m.items_import_urls_title()}
					</DialogTitle>
					<DialogDescription>{m.items_import_urls_description()}</DialogDescription>
				</DialogHeader>

				{step === 'input' ? (
					<div className="flex flex-col gap-3">
						<div className="grid gap-2">
							<Label htmlFor="import-urls-textarea">{m.items_import_urls_label()}</Label>
							<Textarea
								id="import-urls-textarea"
								rows={10}
								value={textValue}
								onChange={e => setTextValue(e.target.value)}
								placeholder={URLS_PLACEHOLDER}
								autoFocus
							/>
							<div className="text-xs text-muted-foreground">{m.items_import_urls_detected({ count: previewCount })}</div>
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
