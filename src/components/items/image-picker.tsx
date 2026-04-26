import { Image as ImageIcon } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

type Props = {
	images: ReadonlyArray<string>
	value: string
	onChange: (url: string) => void
	className?: string
	disabled?: boolean
}

// Horizontal thumbnail picker shown next to the URL field when a scrape
// returns more than one viable product image. The first surviving image
// is selected by default; the user can click any thumbnail to swap.
//
// Renders nothing when there's only one image - the saved item just uses
// that image directly. Falls back to a small placeholder when the entire
// candidate list got filtered out.
export function ImagePicker({ images, value, onChange, className, disabled }: Props): React.ReactElement | null {
	if (images.length === 0) return null
	if (images.length === 1) return null

	return (
		<div className={cn('space-y-1', className)}>
			<div className="text-xs text-muted-foreground">{images.length} candidate images</div>
			<div role="radiogroup" aria-label="Product image" className="flex gap-2 overflow-x-auto pb-1">
				{images.map(url => (
					<ImageThumb key={url} url={url} selected={url === value} disabled={disabled === true} onSelect={() => onChange(url)} />
				))}
			</div>
		</div>
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
