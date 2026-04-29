import { useState } from 'react'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { httpsUpgrade } from '@/lib/image-url'
import { cn } from '@/lib/utils'

type Props = {
	src: string
	alt: string
	className?: string
}

export function ItemImage({ src, alt, className }: Props) {
	const [open, setOpen] = useState(false)
	const safeSrc = httpsUpgrade(src)

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className={cn(
					'group relative shrink-0 overflow-hidden rounded-md ring-1 ring-inset ring-border bg-muted/40 transition hover:ring-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-zoom-in',
					className
				)}
				aria-label={`View larger image of ${alt}`}
			>
				<img
					src={safeSrc}
					alt={alt}
					className="object-contain w-16 max-h-16 xs:w-24 xs:max-h-24 transition-transform group-hover:scale-105"
				/>
			</button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-w-[min(90vw,48rem)] sm:max-w-[min(90vw,48rem)] p-2 bg-popover" showCloseButton>
					<DialogTitle className="sr-only">{alt}</DialogTitle>
					<img src={safeSrc} alt={alt} className="w-full h-auto max-h-[80vh] object-contain rounded-md" />
				</DialogContent>
			</Dialog>
		</>
	)
}
