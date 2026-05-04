import { useQueryClient } from '@tanstack/react-query'
import { Loader2, ShoppingBag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { bulkCreateItems, fetchImportSource, type ItemDraft } from '@/api/import'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { parseAmazonWishlist } from '@/lib/import/parsers/amazon-wishlist'
import { itemsKeys } from '@/lib/queries/items'

import { ImportPreviewTable } from './import-preview-table'

type Props = {
	listId: number
	open: boolean
	onOpenChange: (open: boolean) => void
}

type Step = 'url' | 'fallback' | 'preview'

/**
 * Three-step Amazon wish-list import. The user pastes a wishlist URL;
 * we hit `fetchImportSource` server-side which runs `safeFetch`
 * against the URL and parses the rendered HTML. When Amazon bot-blocks
 * the request (or the page parses to zero rows), we drop into a
 * fallback step that asks the user to paste the wishlist HTML
 * (instructions: View Source, copy outerHTML, paste). The same parser
 * runs against the pasted HTML client-side, then the preview table
 * takes over the rest of the flow.
 */
export function ImportDialogAmazon({ listId, open, onOpenChange }: Props) {
	const queryClient = useQueryClient()
	const [step, setStep] = useState<Step>('url')
	const [url, setUrl] = useState('')
	const [pastedHtml, setPastedHtml] = useState('')
	const [drafts, setDrafts] = useState<Array<ItemDraft>>([])
	const [selected, setSelected] = useState<Set<number>>(new Set())
	const [submitting, setSubmitting] = useState(false)
	const [fetching, setFetching] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!open) {
			setStep('url')
			setUrl('')
			setPastedHtml('')
			setDrafts([])
			setSelected(new Set())
			setSubmitting(false)
			setFetching(false)
			setError(null)
		}
	}, [open])

	const fetchAndParse = async () => {
		const trimmed = url.trim()
		if (!trimmed) return
		setFetching(true)
		setError(null)
		try {
			const result = await fetchImportSource({ data: { source: 'amazon-wishlist', url: trimmed } })
			if (result.kind === 'ok') {
				setDrafts(result.drafts)
				setSelected(new Set())
				setStep('preview')
			} else {
				// Bot-blocked, empty, or fetch failed: surface the paste-HTML
				// fallback. The reason is informational only; the next step is
				// the same regardless.
				setStep('fallback')
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch wishlist')
		} finally {
			setFetching(false)
		}
	}

	const parsePastedHtml = () => {
		const parsed = parseAmazonWishlist(pastedHtml, url || 'https://www.amazon.com')
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
						<ShoppingBag className="size-5" /> Import from Amazon wish list
					</DialogTitle>
					<DialogDescription>
						Paste your wish list URL. If Amazon blocks the fetch, we'll ask you to paste the page's HTML instead.
					</DialogDescription>
				</DialogHeader>

				{step === 'url' && (
					<div className="flex flex-col gap-3">
						<div className="grid gap-2">
							<Label htmlFor="import-amazon-url">Amazon wish list URL</Label>
							<Input
								id="import-amazon-url"
								type="url"
								value={url}
								onChange={e => setUrl(e.target.value)}
								placeholder="https://www.amazon.com/hz/wishlist/ls/..."
								disabled={fetching}
								autoFocus
							/>
						</div>
						{error && (
							<Alert variant="destructive">
								<AlertTitle>Error</AlertTitle>
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={fetching}>
								Cancel
							</Button>
							<Button type="button" onClick={fetchAndParse} disabled={fetching || url.trim().length === 0}>
								{fetching ? <Loader2 className="size-4 animate-spin" /> : null}
								{fetching ? 'Fetching...' : 'Fetch wish list'}
							</Button>
						</DialogFooter>
					</div>
				)}

				{step === 'fallback' && (
					<div className="flex flex-col gap-3">
						<Alert>
							<AlertTitle>Couldn't fetch the page automatically</AlertTitle>
							<AlertDescription>
								Open your wish list in the browser, right-click the page and choose "View Page Source", select all, copy, and paste below.
								(Or open dev tools, copy the body's outerHTML.)
							</AlertDescription>
						</Alert>
						<div className="grid gap-2">
							<Label htmlFor="import-amazon-html">Wish list HTML</Label>
							<Textarea
								id="import-amazon-html"
								rows={8}
								value={pastedHtml}
								onChange={e => setPastedHtml(e.target.value)}
								placeholder="<!doctype html>..."
								autoFocus
							/>
						</div>
						{error && (
							<Alert variant="destructive">
								<AlertTitle>Error</AlertTitle>
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => setStep('url')}>
								Back
							</Button>
							<Button type="button" onClick={parsePastedHtml} disabled={pastedHtml.trim().length === 0}>
								Parse HTML
							</Button>
						</DialogFooter>
					</div>
				)}

				{step === 'preview' && (
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
							onCancel={() => setStep('url')}
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
