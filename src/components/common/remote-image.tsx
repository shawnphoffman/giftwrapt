import { ImageOffIcon } from 'lucide-react'
import type { ComponentProps, ReactNode, SyntheticEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { httpsUpgrade } from '@/lib/image-url'
import { cn } from '@/lib/utils'

// Load-failure tracking for an image URL we may not host. Retailer CDNs
// rotate paths, so a hotlinked product image can 404 at any time; callers
// swap in a placeholder once `failed` flips. Resets when `src` changes.
export function useImageFallback(src: string) {
	const safeSrc = httpsUpgrade(src)
	const [failedSrc, setFailedSrc] = useState<string | null>(null)
	const ref = useRef<HTMLImageElement>(null)

	// A server-rendered <img> can fail before hydration attaches onError, and
	// the event never replays. Catch that case on mount: a finished load with
	// no pixels is a failure.
	useEffect(() => {
		const img = ref.current
		if (img && img.complete && img.naturalWidth === 0) setFailedSrc(safeSrc)
	}, [safeSrc])

	const onError = useCallback(() => setFailedSrc(safeSrc), [safeSrc])

	return { src: safeSrc, failed: failedSrc === safeSrc, ref, onError }
}

export function ImageFallbackTile({ className, label }: { className?: string; label?: string }) {
	return (
		<span
			role={label ? 'img' : undefined}
			aria-label={label || undefined}
			aria-hidden={label ? undefined : true}
			className={cn('flex shrink-0 items-center justify-center bg-muted text-muted-foreground', className)}
		>
			<ImageOffIcon className="size-1/3 max-h-6 max-w-6" />
		</span>
	)
}

type RemoteImageProps = Omit<ComponentProps<'img'>, 'src' | 'ref'> & {
	src: string
	// Replaces the default tile. Pass `null` to render nothing on failure.
	fallback?: ReactNode
	// Extra classes for the default tile, for images sized by max-w/max-h
	// that would otherwise collapse the tile to nothing.
	fallbackClassName?: string
}

// Drop-in <img> for item / addon images: upgrades http to https and shows a
// placeholder tile, sized by the same className, when the image fails.
export function RemoteImage({ src, alt, className, fallback, fallbackClassName, onError, ...rest }: RemoteImageProps) {
	const image = useImageFallback(src)
	if (image.failed) {
		if (fallback !== undefined) return <>{fallback}</>
		return <ImageFallbackTile className={cn(className, fallbackClassName)} label={alt} />
	}
	return (
		<img
			{...rest}
			ref={image.ref}
			src={image.src}
			alt={alt}
			className={className}
			onError={(e: SyntheticEvent<HTMLImageElement>) => {
				image.onError()
				onError?.(e)
			}}
		/>
	)
}
