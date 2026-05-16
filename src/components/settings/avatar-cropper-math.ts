// Pure geometry helpers for the avatar cropper dialog. Kept separate
// from the React component so the math is exercised by node-environment
// unit tests without dragging in canvas/ResizeObserver shims.
//
// Coordinate model: the rendered image uses transform-origin: top-left,
// so its displayed top-left corner is exactly (tx, ty) and a natural-
// pixel point (px, py) maps to viewport position (px*scale + tx,
// py*scale + ty). The viewport is a square of side `v` centered on the
// origin (0,0)..(v,v). The "cover" constraint keeps the rendered image
// blanketing the viewport at all times, so:
//   tx ∈ [v - w*s, 0]   and   ty ∈ [v - h*s, 0]

export type NaturalSize = { w: number; h: number }

export type Translation = { tx: number; ty: number }

export type ScaleBounds = { min: number; max: number }

export type CropRect = { sx: number; sy: number; sSize: number }

// Minimum scale that keeps the image covering the viewport on the
// shorter axis. Max scale is 4x that, with a tiny floor so the slider
// doesn't collapse to a single point on already-tiny images.
export function computeScaleBounds(natural: NaturalSize, viewport: number): ScaleBounds {
	const min = Math.max(viewport / natural.w, viewport / natural.h)
	const max = Math.max(min * 4, min + 0.01)
	return { min, max }
}

// Centered initial translation when the image first loads or the user
// hits Reset. Both axes are clamped by construction: at min scale the
// image just barely covers, so the centered offset is the only valid
// position on the shorter axis.
export function centerTranslation(natural: NaturalSize, viewport: number, scale: number): Translation {
	return {
		tx: (viewport - natural.w * scale) / 2,
		ty: (viewport - natural.h * scale) / 2,
	}
}

// Initial fit: minimum cover scale, centered. Returned as a single
// snapshot the React layer can splat into its state.
export function fitImage(natural: NaturalSize, viewport: number): { scale: number; bounds: ScaleBounds; translation: Translation } {
	const bounds = computeScaleBounds(natural, viewport)
	const scale = bounds.min
	return { scale, bounds, translation: centerTranslation(natural, viewport, scale) }
}

// Clamp a candidate translation back into the cover-the-viewport
// rectangle. Used after every drag, zoom, or viewport resize.
export function clampTranslation(t: Translation, natural: NaturalSize, viewport: number, scale: number): Translation {
	return {
		tx: Math.min(0, Math.max(viewport - natural.w * scale, t.tx)),
		ty: Math.min(0, Math.max(viewport - natural.h * scale, t.ty)),
	}
}

// Zoom toward an anchor point in viewport-space — the natural-image
// pixel currently under (anchorX, anchorY) stays under (anchorX,
// anchorY) at the new scale. The cropper anchors zoom on the viewport
// center for both the wheel and the slider so the framed pixel doesn't
// drift while the user dials in the zoom level.
export function zoomAround(
	current: { scale: number; tx: number; ty: number },
	nextScale: number,
	anchor: { x: number; y: number },
	natural: NaturalSize,
	viewport: number,
	bounds: ScaleBounds
): { scale: number; tx: number; ty: number } {
	const clampedScale = Math.min(bounds.max, Math.max(bounds.min, nextScale))
	const ix = (anchor.x - current.tx) / current.scale
	const iy = (anchor.y - current.ty) / current.scale
	const proposed = {
		tx: anchor.x - ix * clampedScale,
		ty: anchor.y - iy * clampedScale,
	}
	const clamped = clampTranslation(proposed, natural, viewport, clampedScale)
	return { scale: clampedScale, tx: clamped.tx, ty: clamped.ty }
}

// Crop rectangle in natural-image pixels: the square region currently
// visible inside the viewport. The canvas draws this rect into an
// OUTPUT_SIZE x OUTPUT_SIZE destination, which the server then resizes
// to its canonical 256x256 WebP.
export function computeCropRect(translation: Translation, scale: number, viewport: number): CropRect {
	// The `|| 0` collapses -0 to 0 so consumers don't see negative-zero
	// when the translation is exactly zero.
	return {
		sx: -translation.tx / scale || 0,
		sy: -translation.ty / scale || 0,
		sSize: viewport / scale,
	}
}
