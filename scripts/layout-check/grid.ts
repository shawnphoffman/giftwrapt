/**
 * Screenshot grid for one route: a row per width, a column per root font
 * size. Each cell is the full-page capture scaled to a common width and
 * cropped to the top of the page, under a label with its finding counts.
 */

import sharp from 'sharp'

export interface GridCell {
	width: number
	size: number
	/** Full-page capture, or null when the cell failed. */
	file: string | null
	findings: number
	newFindings: number
}

const CELL_W = 300
const MAX_CELL_H = 900
const LABEL_H = 26
const GAP = 12
const BG = '#e5e7eb'

function escapeXml(s: string): string {
	return s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!)
}

function labelSvg(text: string, color: string): Buffer {
	return Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_W}" height="${LABEL_H}">` +
			`<text x="2" y="18" font-family="Helvetica, Arial, sans-serif" font-size="14" font-weight="600" fill="${color}">${escapeXml(text)}</text>` +
			`</svg>`
	)
}

async function cellImage(file: string | null): Promise<{ buf: Buffer; h: number }> {
	if (!file) {
		const buf = await sharp({ create: { width: CELL_W, height: 120, channels: 3, background: '#fecaca' } })
			.png()
			.toBuffer()
		return { buf, h: 120 }
	}
	const resized = await sharp(file).resize({ width: CELL_W }).toBuffer({ resolveWithObject: true })
	const h = Math.min(resized.info.height, MAX_CELL_H)
	const buf = await sharp(resized.data).extract({ left: 0, top: 0, width: CELL_W, height: h }).png().toBuffer()
	return { buf, h }
}

export async function composeGrid(title: string, widths: Array<number>, sizes: Array<number>, cells: Array<GridCell>, outPath: string) {
	const rows: Array<{ y: number; cells: Array<{ buf: Buffer; h: number; cell: GridCell | undefined }> }> = []
	const TITLE_H = 34
	let y = TITLE_H
	for (const width of widths) {
		const row = []
		for (const size of sizes) {
			const cell = cells.find(c => c.width === width && c.size === size)
			row.push({ ...(await cellImage(cell?.file ?? null)), cell })
		}
		rows.push({ y, cells: row })
		y += LABEL_H + Math.max(...row.map(c => c.h)) + GAP
	}

	const totalW = GAP + sizes.length * (CELL_W + GAP)
	const totalH = y
	const layers: Array<sharp.OverlayOptions> = [
		{
			input: Buffer.from(
				`<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${TITLE_H}">` +
					`<text x="${GAP}" y="23" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="700" fill="#111827">${escapeXml(title)}</text>` +
					`</svg>`
			),
			left: 0,
			top: 0,
		},
	]
	for (const row of rows) {
		row.cells.forEach((c, i) => {
			const left = GAP + i * (CELL_W + GAP)
			const size = sizes[i]
			const n = c.cell?.findings ?? 0
			const k = c.cell?.newFindings ?? 0
			const text = c.cell?.file
				? `${c.cell.width}px @ ${size}%: ${n} finding${n === 1 ? '' : 's'}${k > 0 ? `, +${k} new` : ''}`
				: `${c.cell?.width ?? '?'}px @ ${size}%: failed`
			const color = !c.cell?.file || k > 0 ? '#b91c1c' : n > 0 ? '#92400e' : '#166534'
			layers.push({ input: labelSvg(text, color), left, top: row.y })
			layers.push({ input: c.buf, left, top: row.y + LABEL_H })
		})
	}

	await sharp({ create: { width: totalW, height: totalH, channels: 3, background: BG } })
		.composite(layers)
		.jpeg({ quality: 75 })
		.toFile(outPath)
}
