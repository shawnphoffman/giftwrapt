import { describe, expect, it } from 'vitest'

import { centerTranslation, clampTranslation, computeCropRect, computeScaleBounds, fitImage, zoomAround } from '../avatar-cropper-math'

const VIEWPORT = 300

describe('computeScaleBounds', () => {
	it('uses the larger of the two axis ratios so the image covers the viewport', () => {
		// 600x900 image at v=300: min scale must blanket the shorter axis (width),
		// so min = 300/600 = 0.5 — and at that scale, height = 0.5*900 = 450 ≥ 300.
		expect(computeScaleBounds({ w: 600, h: 900 }, VIEWPORT)).toEqual({ min: 0.5, max: 2 })
	})

	it('handles wider-than-tall images symmetrically', () => {
		expect(computeScaleBounds({ w: 1200, h: 600 }, VIEWPORT)).toEqual({ min: 0.5, max: 2 })
	})

	it('uses an exact-cover min for perfectly square images', () => {
		expect(computeScaleBounds({ w: 300, h: 300 }, VIEWPORT)).toEqual({ min: 1, max: 4 })
	})

	it('keeps a floor on max so degenerate ranges still have a slidable range', () => {
		// Tiny image: minScale would be huge already; max is min + 0.01 if 4x is somehow smaller.
		const bounds = computeScaleBounds({ w: 30, h: 30 }, VIEWPORT)
		expect(bounds.min).toBe(10)
		expect(bounds.max).toBe(40)
	})
})

describe('centerTranslation', () => {
	it('returns 0,0 when the rendered image exactly fills the viewport', () => {
		expect(centerTranslation({ w: 300, h: 300 }, VIEWPORT, 1)).toEqual({ tx: 0, ty: 0 })
	})

	it('shifts a wider-than-viewport image into negative tx, centering horizontally', () => {
		// 1200 x 600 image at scale 0.5 → 600 x 300. Centered horizontally: tx=(300-600)/2=-150, ty=0.
		expect(centerTranslation({ w: 1200, h: 600 }, VIEWPORT, 0.5)).toEqual({ tx: -150, ty: 0 })
	})

	it('shifts a taller-than-viewport image into negative ty', () => {
		expect(centerTranslation({ w: 600, h: 900 }, VIEWPORT, 0.5)).toEqual({ tx: 0, ty: -75 })
	})
})

describe('clampTranslation', () => {
	const natural = { w: 600, h: 600 }

	it('passes a translation through unchanged when already inside bounds', () => {
		const result = clampTranslation({ tx: -50, ty: -50 }, natural, VIEWPORT, 1)
		expect(result).toEqual({ tx: -50, ty: -50 })
	})

	it('clamps positive translations back to 0 so the image edge never crosses the viewport edge', () => {
		const result = clampTranslation({ tx: 100, ty: 100 }, natural, VIEWPORT, 1)
		expect(result).toEqual({ tx: 0, ty: 0 })
	})

	it('clamps over-shifted translations to the negative cover-bound', () => {
		// 600x600 image at scale 1, viewport 300: tx must be ≥ 300-600 = -300.
		const result = clampTranslation({ tx: -500, ty: -500 }, natural, VIEWPORT, 1)
		expect(result).toEqual({ tx: -300, ty: -300 })
	})

	it('respects different bounds when the scale changes', () => {
		// At scale 0.6, displayed size = 360; tx must be in [300-360, 0] = [-60, 0].
		const result = clampTranslation({ tx: -1000, ty: 5 }, natural, VIEWPORT, 0.6)
		expect(result).toEqual({ tx: -60, ty: 0 })
	})
})

describe('fitImage', () => {
	it('seeds the cropper at min scale, centered', () => {
		const fit = fitImage({ w: 1200, h: 600 }, VIEWPORT)
		expect(fit.scale).toBe(0.5)
		expect(fit.bounds).toEqual({ min: 0.5, max: 2 })
		expect(fit.translation).toEqual({ tx: -150, ty: 0 })
	})
})

describe('zoomAround', () => {
	const natural = { w: 600, h: 600 }
	const bounds = { min: 0.5, max: 4 }

	it('keeps the anchor pixel under the same viewport point when zooming in', () => {
		// Start centered at scale 1: tx=ty=-150 (so image center (300,300) maps to viewport center (150,150)).
		const start = { scale: 1, tx: -150, ty: -150 }
		const next = zoomAround(start, 2, { x: VIEWPORT / 2, y: VIEWPORT / 2 }, natural, VIEWPORT, bounds)
		expect(next.scale).toBe(2)
		// At scale 2, viewport center should still show the same image-pixel (300,300):
		// (300*2 + tx, 300*2 + ty) === (150, 150) → tx = ty = -450.
		expect(next.tx).toBe(-450)
		expect(next.ty).toBe(-450)
	})

	it('clamps the resulting translation so the image still covers after the zoom', () => {
		// At scale 0.5, tx must be in [300-300, 0] = [0, 0]. Even if zooming
		// "should" leave a negative tx, the clamp forces it to 0.
		const start = { scale: 1, tx: 0, ty: 0 }
		const next = zoomAround(start, 0.5, { x: 0, y: 0 }, natural, VIEWPORT, bounds)
		expect(next.scale).toBe(0.5)
		expect(next.tx).toBe(0)
		expect(next.ty).toBe(0)
	})

	it('clamps the proposed scale to the configured bounds', () => {
		const start = { scale: 1, tx: -150, ty: -150 }
		const tooBig = zoomAround(start, 99, { x: 150, y: 150 }, natural, VIEWPORT, bounds)
		expect(tooBig.scale).toBe(bounds.max)
		const tooSmall = zoomAround(start, 0.0001, { x: 150, y: 150 }, natural, VIEWPORT, bounds)
		expect(tooSmall.scale).toBe(bounds.min)
	})
})

describe('computeCropRect', () => {
	it('returns the natural-pixel region currently visible inside the viewport', () => {
		// 600x600 image at scale 1, tx=-100, ty=-50 means the visible top-left
		// corresponds to natural-pixel (100, 50), and the visible region is
		// 300/1 = 300 px wide.
		expect(computeCropRect({ tx: -100, ty: -50 }, 1, VIEWPORT)).toEqual({ sx: 100, sy: 50, sSize: 300 })
	})

	it('scales the source rect inversely to the zoom level', () => {
		expect(computeCropRect({ tx: 0, ty: 0 }, 2, VIEWPORT)).toEqual({ sx: 0, sy: 0, sSize: 150 })
		expect(computeCropRect({ tx: 0, ty: 0 }, 0.5, VIEWPORT)).toEqual({ sx: 0, sy: 0, sSize: 600 })
	})
})
