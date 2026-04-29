// Client-side image downscale before upload. The server (Sharp) re-processes
// every upload and is the source of truth for dimensions/format; this pass
// only exists to keep the request payload small enough to clear the function
// runtime's request-body limit (Vercel's edge limit is 1 MB; even Node
// functions cap around 4.5 MB by default). Modern phone cameras routinely
// produce 5-15 MB JPEGs that would never make it.
//
// The resize is best-effort: any failure (unsupported codec like HEIC on
// Chrome, missing canvas in tests, etc.) returns the original file and lets
// the server's payload check produce the canonical error.

const MAX_LONG_EDGE = 1600
const JPEG_QUALITY = 0.85
const SKIP_BELOW_BYTES = 512 * 1024

export async function resizeImageForUpload(file: File): Promise<File> {
	if (!file.type.startsWith('image/')) return file
	// SVG is vector (no raster to resize) and GIF would lose animation.
	if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file
	if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file

	let bitmap: ImageBitmap
	try {
		bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
	} catch {
		return file
	}

	const longEdge = Math.max(bitmap.width, bitmap.height)
	const needsScale = longEdge > MAX_LONG_EDGE
	if (!needsScale && file.size < SKIP_BELOW_BYTES) {
		bitmap.close()
		return file
	}

	const scale = needsScale ? MAX_LONG_EDGE / longEdge : 1
	const targetW = Math.max(1, Math.round(bitmap.width * scale))
	const targetH = Math.max(1, Math.round(bitmap.height * scale))

	const canvas = document.createElement('canvas')
	canvas.width = targetW
	canvas.height = targetH
	const ctx = canvas.getContext('2d')
	if (!ctx) {
		bitmap.close()
		return file
	}
	ctx.drawImage(bitmap, 0, 0, targetW, targetH)
	bitmap.close()

	const blob = await new Promise<Blob | null>(resolve => {
		canvas.toBlob(b => resolve(b), 'image/jpeg', JPEG_QUALITY)
	})
	if (!blob || blob.size >= file.size) return file

	const baseName = file.name.replace(/\.[^.]+$/, '') || 'image'
	return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
}
