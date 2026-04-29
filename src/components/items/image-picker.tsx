import { Image as ImageIcon, ImageOff } from 'lucide-react'
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
// Renders nothing only when there are zero candidates AND no current
// selection — i.e. when there's nothing for the user to act on.
export function ImagePicker({ images, value, onChange, className, disabled }: Props): React.ReactElement | null {
	if (images.length === 0) return null

	const noneSelected = !value
	const label = `${images.length} candidate ${images.length === 1 ? 'image' : 'images'}`

	return (
		<div className={cn('space-y-1', className)}>
			<div className="text-xs text-muted-foreground">{label}</div>
			<div role="radiogroup" aria-label="Product image" className="flex flex-wrap gap-2">
				<NoneThumb selected={noneSelected} disabled={disabled === true} onSelect={() => onChange('')} />
				{images.map(url => (
					<ImageThumb key={url} url={url} selected={url === value} disabled={disabled === true} onSelect={() => onChange(url)} />
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

function ImageThumb({ url, selected, disabled, onSelect }: { url: string; selected: boolean; disabled: boolean; onSelect: () => void }) {
	const [errored, setErrored] = React.useState(false)
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
			{errored ? (
				<div className="flex h-full w-full items-center justify-center text-muted-foreground">
					<ImageIcon className="size-5" />
				</div>
			) : (
				<img src={url} alt="" loading="lazy" onError={() => setErrored(true)} className="h-full w-full object-cover" />
			)}
		</button>
	)
}
