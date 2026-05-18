import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { detectPdf, processAttachment } from '../attachment-pipeline'
import { UploadError } from '../errors'

// `%PDF-` followed by the version bytes and a trailing EOF marker. Real
// PDFs are far larger; the pipeline only inspects the magic prefix.
const PDF_SAMPLE = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(16), Buffer.from('\n%%EOF\n')])

describe('detectPdf', () => {
	it('recognizes the %PDF- magic prefix', () => {
		expect(detectPdf(PDF_SAMPLE)).toBe(true)
	})

	it('rejects bytes that are not a PDF', () => {
		expect(detectPdf(Buffer.from('not a pdf at all'))).toBe(false)
		expect(detectPdf(Buffer.from([0x25, 0x50, 0x44, 0x46]))).toBe(false) // 4 bytes, missing `-`
	})

	it('rejects empty input', () => {
		expect(detectPdf(Buffer.alloc(0))).toBe(false)
	})
})

describe('processAttachment', () => {
	it('passes PDF bytes through unchanged', async () => {
		const out = await processAttachment(PDF_SAMPLE)
		expect(out.kind).toBe('pdf')
		expect(out.contentType).toBe('application/pdf')
		expect(out.ext).toBe('pdf')
		expect(out.buffer.equals(PDF_SAMPLE)).toBe(true)
	})

	it('transcodes a real image to webp', async () => {
		const png = await sharp({
			create: { width: 16, height: 16, channels: 3, background: { r: 255, g: 0, b: 0 } },
		})
			.png()
			.toBuffer()

		const out = await processAttachment(png)
		expect(out.kind).toBe('image')
		expect(out.contentType).toBe('image/webp')
		expect(out.ext).toBe('webp')
		// First 4 bytes of WebP are 'RIFF'.
		expect(out.buffer.slice(0, 4).toString('ascii')).toBe('RIFF')
	})

	it('throws UploadError(bad-mime) for bytes that are neither image nor PDF', async () => {
		await expect(processAttachment(Buffer.from('not an attachment'))).rejects.toBeInstanceOf(UploadError)
	})
})
