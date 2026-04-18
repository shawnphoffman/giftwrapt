import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { PlusCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { createItem } from '@/api/items'
import { getMyLists } from '@/api/lists'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

export const Route = createFileRoute('/(core)/item/import/{-$url}')({
	component: ItemImportPage,
})

function ItemImportPage() {
	const params = Route.useParams()
	const navigate = useNavigate()
	const importUrl = decodeURIComponent((params as Record<string, string>).url || '')

	const [title, setTitle] = useState('')
	const [price, setPrice] = useState('')
	const [notes, setNotes] = useState('')
	const [imageUrl, setImageUrl] = useState('')
	const [selectedListId, setSelectedListId] = useState('')
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const { data: myLists } = useQuery({
		queryKey: ['my-lists-for-import'],
		queryFn: () => getMyLists(),
	})

	const publicLists = myLists?.public ?? []
	const privateLists = myLists?.private ?? []

	const handleSave = async () => {
		const listId = Number(selectedListId)
		if (!listId || !title.trim()) return

		setSaving(true)
		setError(null)
		try {
			const result = await createItem({
				data: {
					listId,
					title: title.trim(),
					url: importUrl || undefined,
					price: price.trim() || undefined,
					notes: notes.trim() || undefined,
					imageUrl: imageUrl.trim() || undefined,
				},
			})

			if (result.kind === 'error') {
				setError(result.reason === 'not-authorized' ? 'No permission to add to that list.' : 'List not found.')
				return
			}

			toast.success('Item imported')
			navigate({ to: '/lists/$listId/edit', params: { listId: selectedListId } })
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save item')
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2">Import Item</h1>
					<PlusCircle className="text-blue-500 wish-page-icon" />
				</div>

				<div className="space-y-4 max-w-lg">
					{importUrl && (
						<div className="grid gap-2">
							<Label>URL</Label>
							<div className="text-sm text-muted-foreground break-all">{importUrl}</div>
						</div>
					)}

					{imageUrl && (
						<div className="flex justify-center">
							<img src={imageUrl} alt="" className="max-h-32 object-contain rounded" />
						</div>
					)}

					<div className="grid gap-2">
						<Label htmlFor="import-title">Title</Label>
						<Input
							id="import-title"
							value={title}
							onChange={e => setTitle(e.target.value)}
							placeholder="Item name"
							disabled={saving}
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="import-price">Price (optional)</Label>
						<Input
							id="import-price"
							value={price}
							onChange={e => setPrice(e.target.value)}
							placeholder="29.99"
							inputMode="decimal"
							disabled={saving}
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="import-notes">Notes (optional)</Label>
						<Textarea
							id="import-notes"
							value={notes}
							onChange={e => setNotes(e.target.value)}
							rows={2}
							placeholder="Color, size, model..."
							disabled={saving}
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="import-list">Add to list</Label>
						<Select value={selectedListId} onValueChange={setSelectedListId} disabled={saving}>
							<SelectTrigger id="import-list">
								<SelectValue placeholder="Select a list" />
							</SelectTrigger>
							<SelectContent>
								{publicLists.length > 0 && (
									<SelectGroup>
										<SelectLabel>Public</SelectLabel>
										{publicLists.map(l => (
											<SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
										))}
									</SelectGroup>
								)}
								{privateLists.length > 0 && (
									<SelectGroup>
										<SelectLabel>Private</SelectLabel>
										{privateLists.map(l => (
											<SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
										))}
									</SelectGroup>
								)}
							</SelectContent>
						</Select>
					</div>

					{error && (
						<Alert variant="destructive">
							<AlertTitle>Error</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<div className="flex gap-2">
						<Button onClick={handleSave} disabled={saving || !title.trim() || !selectedListId}>
							{saving ? 'Saving...' : 'Add to list'}
						</Button>
						<Button variant="outline" onClick={() => navigate({ to: '/me' })} disabled={saving}>
							Cancel
						</Button>
					</div>
				</div>
			</div>
		</div>
	)
}
