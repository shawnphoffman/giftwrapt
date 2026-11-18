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
import { errorText } from '@/lib/i18n/errors'
import { parseAmazonWishlist } from '@/lib/import/parsers/amazon-wishlist'
import { itemsKeys } from '@/lib/queries/items'
import { m } from '@/paraglide/messages.js'

import { ImportPreviewTable } from './import-preview-table'

type Props = {
	listId: number
	open: boolean
	onOpenChange: (open: boolean) => void
}

type Step = 'url' | 'fallback' | 'preview'

// These show the expected shape of what to paste; not translated.
const URL_PLACEHOLDER = 'https://www.amazon.com/hz/wishlist/ls/...'
const HTML_PLACEHOLDER = '<!doctype html>...'

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
			setError(errorText(err, m.items_import_amazon_error_fetch()))
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
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<ShoppingBag className="size-5" /> {m.items_import_amazon_title()}
					</DialogTitle>
					<DialogDescription>{m.items_import_amazon_description()}</DialogDescription>
				</DialogHeader>

				{step === 'url' && (
					<div className="flex flex-col gap-3">
						<div className="grid gap-2">
							<Label htmlFor="import-amazon-url">{m.items_import_amazon_url_label()}</Label>
							<Input
								id="import-amazon-url"
								type="url"
								value={url}
								onChange={e => setUrl(e.target.value)}
								placeholder={URL_PLACEHOLDER}
								disabled={fetching}
								autoFocus
							/>
						</div>
						{error && (
							<Alert variant="destructive">
								<AlertTitle>{m.items_error_title()}</AlertTitle>
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={fetching}>
								{m.action_cancel()}
							</Button>
							<Button type="button" onClick={fetchAndParse} disabled={fetching || url.trim().length === 0}>
								{fetching ? <Loader2 className="size-4 animate-spin" /> : null}
								{fetching ? m.items_import_amazon_fetching() : m.items_import_amazon_fetch_button()}
							</Button>
						</DialogFooter>
					</div>
				)}

				{step === 'fallback' && (
					<div className="flex flex-col gap-3">
						<Alert>
							<AlertTitle>{m.items_import_amazon_fallback_title()}</AlertTitle>
							<AlertDescription>{m.items_import_amazon_fallback_description()}</AlertDescription>
						</Alert>
						<div className="grid gap-2">
							<Label htmlFor="import-amazon-html">{m.items_import_amazon_html_label()}</Label>
							<Textarea
								id="import-amazon-html"
								rows={8}
								value={pastedHtml}
								onChange={e => setPastedHtml(e.target.value)}
								placeholder={HTML_PLACEHOLDER}
								autoFocus
							/>
						</div>
						{error && (
							<Alert variant="destructive">
								<AlertTitle>{m.items_error_title()}</AlertTitle>
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => setStep('url')}>
								{m.action_back()}
							</Button>
							<Button type="button" onClick={parsePastedHtml} disabled={pastedHtml.trim().length === 0}>
								{m.items_import_amazon_parse_button()}
							</Button>
						</DialogFooter>
					</div>
				)}

				{step === 'preview' && (
					<div className="flex min-w-0 flex-col gap-3">
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
							onCancel={() => setStep('url')}
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
