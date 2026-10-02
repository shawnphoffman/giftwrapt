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
import { MAX_PASTE_CHARS } from '@/lib/paste-items/prompt'
import { itemsKeys } from '@/lib/queries/items'

import { ImportPreviewTable } from './import-preview-table'

type Props = {
	listId: number
	open: boolean
	onOpenChange: (open: boolean) => void
}

type Step = 'input' | 'preview'

type ExtractError = Extract<ExtractItemsFromTextResult, { kind: 'error' }>['reason']

const EXTRACT_ERRORS: Record<ExtractError, string> = {
	'feature-disabled': 'Paste Text is turned off. Ask your admin to turn it on.',
	'not-configured': 'Paste Text is not set up on this site yet.',
	'ai-budget-exceeded': 'AI features are paused for this month. Add the items by hand, or paste links with Paste URLs.',
	'ai-failed': 'Could not read that text just now. Try again.',
	'rate-limited': 'That is a lot of requests. Try again in a minute.',
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
				setError(EXTRACT_ERRORS[result.reason])
				return
			}
			if (result.items.length === 0) {
				setError('Could not find anything to add in that text.')
				return
			}
			setDrafts(result.items)
			setSelected(new Set())
			setStep('preview')
		} catch {
			setError('Could not read that text just now. Try again.')
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
						<Sparkles className="size-5" /> Paste Text
					</DialogTitle>
					<DialogDescription>
						Paste a list from your notes, a message, or anything else. An AI model picks out the items, and you check them before anything
						is added. Only the text you paste is sent to it.
					</DialogDescription>
				</DialogHeader>

				{step === 'input' ? (
					<div className="flex flex-col gap-3">
						<div className="grid gap-2">
							<Label htmlFor="import-text-textarea">Text</Label>
							<Textarea
								id="import-text-textarea"
								rows={10}
								value={textValue}
								onChange={e => setTextValue(e.target.value)}
								placeholder={'Things I would love this year:\n- the blue enamel mug, big size\n- wool socks, size M\n...'}
								disabled={reading}
								autoFocus
							/>
							<div className={tooLong ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
								{trimmed.length.toLocaleString()} of {MAX_PASTE_CHARS.toLocaleString()} characters
								{tooLong ? '. Paste a shorter piece.' : ''}
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
							<Button type="button" onClick={read} disabled={trimmed.length === 0 || tooLong || reading}>
								{reading ? 'Reading…' : 'Find Items'}
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

function reasonToMessage(reason: 'list-not-found' | 'not-authorized' | 'feature-disabled' | 'todo-list-rejects-items'): string {
	if (reason === 'list-not-found') return 'List not found.'
	if (reason === 'not-authorized') return 'You do not have permission to add to this list.'
	if (reason === 'todo-list-rejects-items') return 'Todo lists do not take gift items.'
	return 'Importing is currently disabled. Ask your admin to turn it on.'
}
