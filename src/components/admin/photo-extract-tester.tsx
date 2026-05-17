import { Camera, Loader2, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useExtractPhoto } from '@/lib/use-extract-photo'

// Admin sandbox for the vision extractor. Mirrors the UI flow on the
// list-edit page (pick photo → see prefill) but renders the raw
// ScrapeResult JSON instead of a prefilled form, so admins can verify
// the configured AI model can actually do vision before turning the
// feature on for users.

export function PhotoExtractTester() {
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [file, setFile] = useState<File | null>(null)
	const [previewUrl, setPreviewUrl] = useState<string | null>(null)
	const { state, start, reset } = useExtractPhoto()

	useEffect(() => {
		if (!file) {
			setPreviewUrl(null)
			return
		}
		const url = URL.createObjectURL(file)
		setPreviewUrl(url)
		return () => URL.revokeObjectURL(url)
	}, [file])

	const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
		const picked = e.target.files?.[0] ?? null
		e.target.value = ''
		if (!picked) return
		setFile(picked)
		reset()
		void start(picked)
	}

	const handleClear = () => {
		setFile(null)
		reset()
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-2xl">Photo Extraction Tester</CardTitle>
				<CardDescription>
					Upload a product photo to verify the configured AI model can extract a ScrapeResult. Same endpoint the add-item Upload Photo flow
					uses. Counts against your per-user rate limit.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePick} />
				<div className="flex items-center gap-2">
					<Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={state.phase === 'extracting'}>
						<Camera className="size-4" />
						{file ? 'Pick another photo' : 'Pick a photo'}
					</Button>
					{file && (
						<Button type="button" variant="outline" size="sm" onClick={handleClear} disabled={state.phase === 'extracting'}>
							<Trash2 className="size-3" /> Clear
						</Button>
					)}
				</div>

				{previewUrl && (
					<div className="flex items-center gap-3">
						<img src={previewUrl} alt="" className="size-24 rounded border object-cover" />
						<span className="truncate text-xs text-muted-foreground">{file?.name}</span>
					</div>
				)}

				{state.phase === 'extracting' && (
					<Alert>
						<Loader2 className="animate-spin text-muted-foreground" />
						<AlertTitle>Extracting… {(state.elapsedMs / 1000).toFixed(1)}s</AlertTitle>
					</Alert>
				)}

				{state.phase === 'failed' && (
					<Alert variant="destructive">
						<AlertTitle>Extraction failed</AlertTitle>
						<AlertDescription>{state.error}</AlertDescription>
					</Alert>
				)}

				{state.phase === 'done' && state.result && (
					<Alert>
						<AlertTitle>Result {state.ms !== undefined && `(${(state.ms / 1000).toFixed(1)}s)`}</AlertTitle>
						<AlertDescription>
							<pre className="mt-2 overflow-x-auto rounded bg-muted p-3 text-xs">{JSON.stringify(state.result, null, 2)}</pre>
						</AlertDescription>
					</Alert>
				)}
			</CardContent>
		</Card>
	)
}
