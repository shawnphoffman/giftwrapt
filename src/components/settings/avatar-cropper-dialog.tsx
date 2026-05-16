'use client'

import { Loader2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
	clampTranslation,
	computeCropRect,
	computeScaleBounds,
	fitImage,
	type NaturalSize,
	zoomAround,
} from '@/components/settings/avatar-cropper-math'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'

// Client-side circular crop dialog. Shown after the user picks an image
// but before it's sent to the server. The picked image is rendered into
// a square viewport with a circular mask so the result matches the final
// avatar shape; the user pans and zooms to frame their face, then we
// rasterize the visible crop to a JPEG File that flows back into the
// existing upload pipeline (server still re-encodes to 256x256 WebP).
//
// Math lives in ./avatar-cropper-math so the geometry (clamp, zoom,
// crop rect) is testable in plain node without a DOM.

interface AvatarCropperDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	imageSrc: string | null
	fileName?: string
	// Called with the cropped JPEG file. While the promise is pending, the
	// dialog stays open showing a saving state so the caller can keep the
	// dialog mounted across the upload (and reopen it if the upload errors
	// by simply not closing it).
	onCropped: (file: File) => Promise<void>
}

const OUTPUT_SIZE = 512

export function AvatarCropperDialog({ open, onOpenChange, imageSrc, fileName, onCropped }: AvatarCropperDialogProps) {
	const imgRef = useRef<HTMLImageElement | null>(null)
	const viewportRef = useRef<HTMLDivElement | null>(null)
	const [naturalSize, setNaturalSize] = useState<NaturalSize | null>(null)
	const [viewportSize, setViewportSize] = useState(320)
	const [scale, setScale] = useState(1)
	const [minScale, setMinScale] = useState(1)
	const [maxScale, setMaxScale] = useState(4)
	const [tx, setTx] = useState(0)
	const [ty, setTy] = useState(0)
	const [loadError, setLoadError] = useState(false)
	const [saving, setSaving] = useState(false)

	useEffect(() => {
		if (!open) {
			setNaturalSize(null)
			setLoadError(false)
			setSaving(false)
		}
	}, [open])

	useEffect(() => {
		if (!open) return
		const el = viewportRef.current
		if (!el) return
		const ro = new ResizeObserver(entries => {
			for (const entry of entries) {
				const s = entry.contentRect.width
				if (s > 0) setViewportSize(s)
			}
		})
		ro.observe(el)
		return () => ro.disconnect()
	}, [open])

	const applyFit = useCallback((natural: NaturalSize, v: number) => {
		const fit = fitImage(natural, v)
		setMinScale(fit.bounds.min)
		setMaxScale(fit.bounds.max)
		setScale(fit.scale)
		setTx(fit.translation.tx)
		setTy(fit.translation.ty)
	}, [])

	const handleImageLoad = useCallback(() => {
		const img = imgRef.current
		if (!img) return
		const w = img.naturalWidth
		const h = img.naturalHeight
		if (!w || !h) {
			setLoadError(true)
			return
		}
		setLoadError(false)
		const natural = { w, h }
		setNaturalSize(natural)
		applyFit(natural, viewportSize)
	}, [applyFit, viewportSize])

	// If the viewport resizes after the image is loaded (responsive
	// shrinking, rotation), refit the bounds without snapping the user's
	// framing back to center.
	useEffect(() => {
		if (!naturalSize) return
		const bounds = computeScaleBounds(naturalSize, viewportSize)
		setMinScale(bounds.min)
		setMaxScale(bounds.max)
		setScale(prev => Math.max(bounds.min, Math.min(bounds.max, prev)))
	}, [viewportSize, naturalSize])

	useEffect(() => {
		if (!naturalSize) return
		// Functional setState so we don't have to depend on tx/ty and loop on
		// our own writes — clamping just normalizes whatever the current
		// translation is after a scale/viewport change.
		setTx(prev => clampTranslation({ tx: prev, ty: 0 }, naturalSize, viewportSize, scale).tx)
		setTy(prev => clampTranslation({ tx: 0, ty: prev }, naturalSize, viewportSize, scale).ty)
	}, [scale, viewportSize, naturalSize])

	const dragRef = useRef<{ startX: number; startY: number; baseTx: number; baseTy: number; pointerId: number } | null>(null)
	const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!naturalSize) return
		e.preventDefault()
		e.currentTarget.setPointerCapture(e.pointerId)
		dragRef.current = { startX: e.clientX, startY: e.clientY, baseTx: tx, baseTy: ty, pointerId: e.pointerId }
	}
	const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current
		if (!drag || drag.pointerId !== e.pointerId || !naturalSize) return
		const next = clampTranslation(
			{ tx: drag.baseTx + (e.clientX - drag.startX), ty: drag.baseTy + (e.clientY - drag.startY) },
			naturalSize,
			viewportSize,
			scale
		)
		setTx(next.tx)
		setTy(next.ty)
	}
	const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current
		if (!drag || drag.pointerId !== e.pointerId) return
		dragRef.current = null
		try {
			e.currentTarget.releasePointerCapture(e.pointerId)
		} catch {
			// Best effort; some browsers reject release on already-released capture.
		}
	}

	const zoomAroundCenter = (newScale: number) => {
		if (!naturalSize) return
		const next = zoomAround({ scale, tx, ty }, newScale, { x: viewportSize / 2, y: viewportSize / 2 }, naturalSize, viewportSize, {
			min: minScale,
			max: maxScale,
		})
		setScale(next.scale)
		setTx(next.tx)
		setTy(next.ty)
	}

	const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
		if (!naturalSize) return
		e.preventDefault()
		const factor = Math.exp(-e.deltaY * 0.0015)
		zoomAroundCenter(scale * factor)
	}

	const onSliderChange = (value: Array<number>) => {
		const v = value[0]
		if (typeof v !== 'number') return
		zoomAroundCenter(v)
	}

	const handleReset = () => {
		if (!naturalSize) return
		applyFit(naturalSize, viewportSize)
	}

	const handleSave = async () => {
		const img = imgRef.current
		if (!img || !naturalSize || saving) return
		const { sx, sy, sSize } = computeCropRect({ tx, ty }, scale, viewportSize)

		const canvas = document.createElement('canvas')
		canvas.width = OUTPUT_SIZE
		canvas.height = OUTPUT_SIZE
		const ctx = canvas.getContext('2d')
		if (!ctx) return
		ctx.imageSmoothingEnabled = true
		ctx.imageSmoothingQuality = 'high'
		ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

		const blob: Blob | null = await new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.92))
		if (!blob) return

		const baseName = (fileName ?? 'avatar').replace(/\.[^/.]+$/, '')
		const file = new File([blob], `${baseName || 'avatar'}.jpg`, { type: 'image/jpeg' })

		setSaving(true)
		try {
			await onCropped(file)
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={next => {
				if (saving) return
				onOpenChange(next)
			}}
		>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Crop avatar</DialogTitle>
					<DialogDescription>Drag to position, scroll or use the slider to zoom. The circle previews the final shape.</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col items-center gap-4">
					<div
						ref={viewportRef}
						className="relative aspect-square w-full max-w-[320px] overflow-hidden rounded-md bg-muted touch-none select-none cursor-grab active:cursor-grabbing"
						onPointerDown={onPointerDown}
						onPointerMove={onPointerMove}
						onPointerUp={endDrag}
						onPointerCancel={endDrag}
						onWheel={onWheel}
					>
						{imageSrc && !loadError && (
							<img
								key={imageSrc}
								ref={imgRef}
								src={imageSrc}
								alt=""
								draggable={false}
								onLoad={handleImageLoad}
								onError={() => setLoadError(true)}
								className="pointer-events-none absolute top-0 left-0 origin-top-left max-w-none will-change-transform"
								style={{
									width: naturalSize ? `${naturalSize.w}px` : 'auto',
									height: naturalSize ? `${naturalSize.h}px` : 'auto',
									transform: naturalSize ? `translate3d(${tx}px, ${ty}px, 0) scale(${scale})` : undefined,
									visibility: naturalSize ? 'visible' : 'hidden',
								}}
							/>
						)}

						{!naturalSize && !loadError && (
							<div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
								<Loader2 className="size-6 animate-spin" />
							</div>
						)}

						{loadError && (
							<div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted-foreground">
								Couldn’t preview this image. Try a JPEG or PNG.
							</div>
						)}

						<div
							aria-hidden
							className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-white/40"
							style={{ boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)' }}
						/>
					</div>

					<div className="flex w-full max-w-[320px] items-center gap-3">
						<button
							type="button"
							aria-label="Zoom out"
							className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 shrink-0"
							onClick={() => zoomAroundCenter(scale - (maxScale - minScale) / 20)}
							disabled={!naturalSize || scale <= minScale + 1e-6}
						>
							<ZoomOut className="size-4" />
						</button>
						<Slider
							min={minScale}
							max={maxScale}
							step={(maxScale - minScale) / 100 || 0.01}
							value={[scale]}
							onValueChange={onSliderChange}
							disabled={!naturalSize}
							aria-label="Zoom"
						/>
						<button
							type="button"
							aria-label="Zoom in"
							className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 shrink-0"
							onClick={() => zoomAroundCenter(scale + (maxScale - minScale) / 20)}
							disabled={!naturalSize || scale >= maxScale - 1e-6}
						>
							<ZoomIn className="size-4" />
						</button>
					</div>
				</div>

				<DialogFooter className="sm:justify-between">
					<Button type="button" variant="ghost" size="sm" onClick={handleReset} disabled={!naturalSize || saving} className="gap-1.5">
						<RotateCcw className="size-3.5" />
						Reset
					</Button>
					<div className="flex gap-2 sm:justify-end">
						<Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
							Cancel
						</Button>
						<Button type="button" size="sm" onClick={handleSave} disabled={!naturalSize || saving || loadError} className="gap-1.5">
							{saving && <Loader2 className="size-3.5 animate-spin" />}
							{saving ? 'Saving…' : 'Save'}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
