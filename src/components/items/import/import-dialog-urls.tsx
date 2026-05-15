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

import { ImportPreviewTable } from './import-preview-table'

type Props = {
	listId: number
	open: boolean
	onOpenChange: (open: boolean) => void
}

type Step = 'input' | 'preview'

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
						<Link2 className="size-5" /> Paste URLs
					</DialogTitle>
					<DialogDescription>
						One URL per line. Titles, prices, and images get filled in by a background scrape after import.
					</DialogDescription>
				</DialogHeader>

				{step === 'input' ? (
					<div className="flex flex-col gap-3">
						<div className="grid gap-2">
							<Label htmlFor="import-urls-textarea">URLs</Label>
							<Textarea
								id="import-urls-textarea"
								rows={10}
								value={textValue}
								onChange={e => setTextValue(e.target.value)}
								placeholder={'https://www.example.com/product-1\nhttps://shop.example.com/another\n...'}
								autoFocus
							/>
							<div className="text-xs text-muted-foreground">
								{previewCount} URL{previewCount === 1 ? '' : 's'} detected.
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
