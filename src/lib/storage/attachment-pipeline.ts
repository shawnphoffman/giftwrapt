import { UploadError } from './errors'
import { assertImageBytes, processImage } from './image-pipeline'

// Purchase-attachment pipeline. Branches by detected content type:
// PDFs pass through byte-for-byte, images go through the existing
// item-image pipeline (sharp normalize -> webp). We DON'T parse PDFs
// server-side; bytes are served back via /api/files with
// `Content-Type: application/pdf`, so the browser opens its built-in
// viewer instead of treating them as scripts.

export type ProcessedAttachment =
	| { kind: 'image'; buffer: Buffer; contentType: 'image/webp'; ext: 'webp' }
	| { kind: 'pdf'; buffer: Buffer; contentType: 'application/pdf'; ext: 'pdf' }

// PDF magic bytes: `%PDF-` (0x25 0x50 0x44 0x46 0x2d). Five bytes is enough
// to disambiguate from every image signature in `detectImageMime`.
export function detectPdf(buf: Buffer): boolean {
	return buf.length >= 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d
}

export async function processAttachment(raw: Buffer): Promise<ProcessedAttachment> {
	if (detectPdf(raw)) {
		return { kind: 'pdf', buffer: raw, contentType: 'application/pdf', ext: 'pdf' }
	}
	// Not a PDF: fall through to the existing image flow. `assertImageBytes`
	// throws UploadError('bad-mime') for anything that isn't a recognized
	// image, which is the right error shape for the upload caller.
	assertImageBytes(raw)
	const processed = await processImage(raw, 'item')
	return { kind: 'image', buffer: processed.buffer, contentType: 'image/webp', ext: 'webp' }
}

// Re-export so callers in tests / future code can use the same type guard.
export { UploadError }
