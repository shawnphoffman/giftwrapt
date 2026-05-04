import { ImageOff } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

type Props = {
	images: ReadonlyArray<string>
	value: string
	onChange: (url: string) => void
	className?: string
	disabled?: boolean
}

// Wrapping thumbnail picker shown next to the URL field when a scrape
// returns viable product images. The first surviving image is selected by
// default; the user can click any thumbnail to swap, or click the "No
// image" tile to opt out entirely (useful when every candidate URL is
// hotlink-blocked or the user just doesn't want a picture).
//
// Tiles whose <img> fires `error` are dropped from the visible list (and
// from the count) on the assumption that a URL the browser can't load is
// also one the rest of the app can't render. If the *currently selected*
// candidate fails to load, we clear the selection so the form doesn't end
// up persisting a known-broken URL.
//
// Renders nothing only when there are zero candidates, i.e. when there's
// nothing for the user to act on.
export function ImagePicker({ images, value, onChange, className, disabled }: Props): React.ReactElement | null {
	const [failed, setFailed] = React.useState<ReadonlySet<string>>(() => new Set())

	// Reset failure tracking when the candidate list changes. A fresh
	// scrape may produce different URLs and we don't want to carry over
	// stale failures (also lets a re-scrape recover if the host was
	// flaking).
	React.useEffect(() => {
		setFailed(new Set())
	}, [images])

	const visible = React.useMemo(() => images.filter(url => !failed.has(url)), [images, failed])

	// If the active selection just got pruned, clear it so the form
	// doesn't save a URL the picker can't even render.
	React.useEffect(() => {
		if (value && failed.has(value)) onChange('')
	}, [failed, value, onChange])

	const handleError = React.useCallback((url: string) => {
		setFailed(prev => {
			if (prev.has(url)) return prev
			const next = new Set(prev)
			next.add(url)
			return next
		})
	}, [])

	if (images.length === 0) return null

	const noneSelected = !value
	const label = visible.length === 0 ? 'No usable images found' : `${visible.length} candidate ${visible.length === 1 ? 'image' : 'images'}`

	return (
		<div className={cn('space-y-1', className)}>
			<div className="text-xs text-muted-foreground">{label}</div>
			<div role="radiogroup" aria-label="Product image" className="flex flex-wrap gap-2">
				<NoneThumb selected={noneSelected} disabled={disabled === true} onSelect={() => onChange('')} />
				{visible.map(url => (
					<ImageThumb
						key={url}
						url={url}
						selected={url === value}
						disabled={disabled === true}
						onSelect={() => onChange(url)}
						onError={() => handleError(url)}
					/>
				))}
			</div>
		</div>
	)
}

function NoneThumb({ selected, disabled, onSelect }: { selected: boolean; disabled: boolean; onSelect: () => void }) {
	return (
		<button
			type="button"
			role="radio"
			aria-checked={selected}
			aria-label="No image"
			title="No image"
			disabled={disabled}
			onClick={onSelect}
			className={cn(
				'group relative flex size-14 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground transition',
				selected ? 'border-primary ring-2 ring-primary text-foreground' : 'border-border hover:border-foreground/30',
				disabled && 'opacity-50 cursor-not-allowed'
			)}
		>
			<ImageOff className="size-5" />
		</button>
	)
}

function ImageThumb({
	url,
	selected,
	disabled,
	onSelect,
	onError,
}: {
	url: string
	selected: boolean
	disabled: boolean
	onSelect: () => void
	onError: () => void
}) {
	return (
		<button
			type="button"
			role="radio"
			aria-checked={selected}
			disabled={disabled}
			onClick={onSelect}
			className={cn(
				'group relative size-14 shrink-0 rounded-md border bg-muted overflow-hidden transition',
				selected ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-foreground/30',
				disabled && 'opacity-50 cursor-not-allowed'
			)}
		>
			<img src={url} alt="" loading="lazy" onError={onError} className="h-full w-full object-cover" />
		</button>
	)
}
