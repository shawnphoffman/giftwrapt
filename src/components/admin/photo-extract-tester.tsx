import { Camera, Loader2, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatNumber } from '@/lib/i18n/format'
import { useExtractPhoto } from '@/lib/use-extract-photo'
import { m } from '@/paraglide/messages.js'

// Admin sandbox for the vision extractor. Mirrors the UI flow on the
// list-edit page (pick photo → see prefill) but renders the raw
// ScrapeResult JSON instead of a prefilled form, so admins can verify
// the configured AI model can actually do vision before turning the
// feature on for users.

const SECONDS = { minimumFractionDigits: 1, maximumFractionDigits: 1 } as const

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
				<CardTitle className="text-2xl">{m.admin_photo_title()}</CardTitle>
				<CardDescription>{m.admin_photo_description()}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePick} />
				<div className="flex items-center gap-2">
					<Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={state.phase === 'extracting'}>
						<Camera className="size-4" />
						{file ? m.admin_photo_pick_another() : m.admin_photo_pick()}
					</Button>
					{file && (
						<Button type="button" variant="outline" onClick={handleClear} disabled={state.phase === 'extracting'}>
							<Trash2 className="size-4" /> {m.action_clear()}
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
						<AlertTitle>{m.admin_photo_extracting({ seconds: formatNumber(state.elapsedMs / 1000, SECONDS) })}</AlertTitle>
					</Alert>
				)}

				{state.phase === 'failed' && (
					<Alert variant="destructive">
						<AlertTitle>{m.admin_photo_failed()}</AlertTitle>
						<AlertDescription>{state.error}</AlertDescription>
					</Alert>
				)}

				{state.phase === 'done' && state.result && (
					<Alert>
						<AlertTitle>
							{state.ms !== undefined
								? m.admin_photo_result_timed({ seconds: formatNumber(state.ms / 1000, SECONDS) })
								: m.admin_photo_result()}
						</AlertTitle>
						<AlertDescription>
							<pre className="mt-2 overflow-x-auto rounded bg-muted p-3 text-xs">{JSON.stringify(state.result, null, 2)}</pre>
						</AlertDescription>
					</Alert>
				)}
			</CardContent>
		</Card>
	)
}
