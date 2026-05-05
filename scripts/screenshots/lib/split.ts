/**
 * Diagonal split-image generator.
 *
 * Combines a `light` and `dark` capture of the same route+viewport into a
 * single split image: dark in the upper-left triangle, light in the
 * lower-right triangle, separated by a thin diagonal stroke.
 *
 *   <root>/<runId>/<viewport>/split/<slug>.png
 */

import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import sharp from 'sharp'

import type { Theme, ViewportName } from '../types'
import type { ManifestEntry } from './output'

export interface SplitEntry {
	slug: string
	viewport: ViewportName
	file: string
	bytes: number
	durationMs: number
}

interface SplitOptions {
	/** Width of the white diagonal separator stroke, in CSS px. Default 3. */
	strokeWidth?: number
	/** Color of the diagonal stroke. Default white. */
	strokeColor?: string
}

export function splitFileForRun(rootDir: string, runId: string, viewport: ViewportName, slug: string): string {
	return join(rootDir, runId, viewport, 'split', `${slug}.png`)
}

/**
 * Compose a single diagonal split PNG from a light + dark pair.
 *
 * The diagonal runs from the top-right corner to the bottom-left corner.
 * Dark fills the upper-left triangle, light fills the lower-right triangle.
 */
export async function composeSplit(lightPath: string, darkPath: string, outPath: string, options: SplitOptions = {}): Promise<number> {
	const stroke = options.strokeWidth ?? 3
	const strokeColor = options.strokeColor ?? '#ffffff'

	const [lightMeta, darkMeta] = await Promise.all([sharp(lightPath).metadata(), sharp(darkPath).metadata()])
	const width = Math.min(lightMeta.width, darkMeta.width)
	const height = Math.min(lightMeta.height, darkMeta.height)
	if (!width || !height) {
		throw new Error(`Cannot read dimensions for split inputs:\n  light=${lightPath}\n  dark=${darkPath}`)
	}

	const lightBuf = await sharp(lightPath).resize(width, height, { fit: 'cover', position: 'left top' }).toBuffer()
	const darkBuf = await sharp(darkPath).resize(width, height, { fit: 'cover', position: 'left top' }).toBuffer()

	// Mask the dark capture down to the upper-left triangle.
	const darkMask = Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
			`<polygon points="0,0 ${width},0 0,${height}" fill="#ffffff"/>` +
			`</svg>`
	)
	const darkTriangle = await sharp(darkBuf)
		.composite([{ input: darkMask, blend: 'dest-in' }])
		.png()
		.toBuffer()

	// Diagonal stroke overlay (top-right to bottom-left).
	const strokeOverlay = Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
			`<line x1="${width}" y1="0" x2="0" y2="${height}" ` +
			`stroke="${strokeColor}" stroke-width="${stroke}" stroke-linecap="square"/>` +
			`</svg>`
	)

	await mkdir(dirname(outPath), { recursive: true })
	const info = await sharp(lightBuf)
		.composite([
			{ input: darkTriangle, top: 0, left: 0 },
			{ input: strokeOverlay, top: 0, left: 0 },
		])
		.png()
		.toFile(outPath)

	return info.size
}

/**
 * Walk a finished run's manifest entries and emit a `split/` mirror for every
 * (viewport × slug) pair that has both `light` and `dark` captures.
 */
export async function composeSplitsForRun(
	rootDir: string,
	runId: string,
	entries: ReadonlyArray<ManifestEntry>,
	options: SplitOptions = {}
): Promise<{ created: Array<SplitEntry>; skipped: Array<{ slug: string; viewport: ViewportName; reason: string }> }> {
	type Pair = Partial<Record<Theme, ManifestEntry>>
	const pairs = new Map<string, Pair>()
	for (const entry of entries) {
		const key = `${entry.viewport}::${entry.slug}`
		const pair = pairs.get(key) ?? {}
		pair[entry.theme] = entry
		pairs.set(key, pair)
	}

	const created: Array<SplitEntry> = []
	const skipped: Array<{ slug: string; viewport: ViewportName; reason: string }> = []

	for (const [key, pair] of pairs) {
		const [viewport, slug] = key.split('::') as [ViewportName, string]
		if (!pair.light || !pair.dark) {
			skipped.push({ slug, viewport, reason: `missing ${pair.light ? 'dark' : 'light'} capture` })
			continue
		}
		const outPath = splitFileForRun(rootDir, runId, viewport, slug)
		const t0 = Date.now()
		try {
			const bytes = await composeSplit(pair.light.file, pair.dark.file, outPath, options)
			created.push({ slug, viewport, file: outPath, bytes, durationMs: Date.now() - t0 })
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			skipped.push({ slug, viewport, reason: msg })
		}
	}

	return { created, skipped }
}
