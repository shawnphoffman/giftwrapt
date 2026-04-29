import sharp from 'sharp'

import { UploadError } from './errors'

export type ImagePreset = 'avatar' | 'item'

export interface ProcessedImage {
	buffer: Buffer
	contentType: 'image/webp'
	extension: 'webp'
	width: number
	height: number
}

// Cap on input pixel count to prevent decompression-bomb DoS (a small
// compressed file that decodes to a huge raster). Sharp's default is
// 268M (~16k x 16k), which is fine for legit photos but lets a 1KB
// crafted PNG OOM the worker. 50M ~= 7000 x 7000, well above any phone
// camera. See sec-review H4.
export const SHARP_PIXEL_LIMIT = 50_000_000

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif'])

export function assertAllowedMime(mime: string): void {
	if (!ALLOWED_MIME.has(mime.toLowerCase())) {
		throw new UploadError('bad-mime', `unsupported image type: ${mime}`)
	}
}

// Magic-byte detection for the image formats we accept. We can't trust
// the client-supplied `file.type` (the browser fills it from the file
// extension and JS can override it), and we don't want to rely on
// sharp's parser as the trust boundary either; sharp can decode many
// half-valid byte streams and would happily try a polyglot file. See
// sec-review H4.
//
// References:
//   JPEG  FF D8 FF
//   PNG   89 50 4E 47 0D 0A 1A 0A
//   GIF   47 49 46 38 37|39 61   (GIF87a / GIF89a)
//   WEBP  bytes 0-3 = 'RIFF', bytes 8-11 = 'WEBP'
//   HEIC  bytes 4-7 = 'ftyp', bytes 8-11 in {heic, heix, hevc, hevx,
//                                            mif1, msf1}
//   AVIF  bytes 4-7 = 'ftyp', bytes 8-11 in {avif, avis}
type DetectedImageMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'image/heic' | 'image/heif' | 'image/avif'

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'])
const AVIF_BRANDS = new Set(['avif', 'avis'])

export function detectImageMime(buf: Buffer): DetectedImageMime | null {
	if (buf.length < 12) return null
	// JPEG
	if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
	// PNG
	if (
		buf[0] === 0x89 &&
		buf[1] === 0x50 &&
		buf[2] === 0x4e &&
		buf[3] === 0x47 &&
		buf[4] === 0x0d &&
		buf[5] === 0x0a &&
		buf[6] === 0x1a &&
		buf[7] === 0x0a
	)
		return 'image/png'
	// GIF
	if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38 && (buf[4] === 0x37 || buf[4] === 0x39) && buf[5] === 0x61)
		return 'image/gif'
	// WEBP (RIFF....WEBP)
	if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
	// HEIC / AVIF (ISO BMFF: ....ftypBRAND)
	if (buf.toString('ascii', 4, 8) === 'ftyp') {
		const brand = buf.toString('ascii', 8, 12).toLowerCase()
		if (HEIF_BRANDS.has(brand)) return brand === 'mif1' || brand === 'msf1' ? 'image/heif' : 'image/heic'
		if (AVIF_BRANDS.has(brand)) return 'image/avif'
	}
	return null
}

/**
 * Validates that `buf` starts with one of the allowed image signatures.
 * Throws `UploadError('bad-mime', ...)` on mismatch. Returns the
 * detected MIME type so callers can log it.
 */
export function assertImageBytes(buf: Buffer): DetectedImageMime {
	const mime = detectImageMime(buf)
	if (!mime) throw new UploadError('bad-mime', 'unrecognized image bytes')
	if (!ALLOWED_MIME.has(mime)) throw new UploadError('bad-mime', `unsupported image type: ${mime}`)
	return mime
}

// Sharp pipeline. Always:
// - auto-rotate using EXIF (phone uploads often have orientation=6)
// - strip metadata (privacy + smaller file)
// - transcode to webp (well-supported, good compression, single canonical format)
//
// Preset differences:
// - avatar: fixed 256x256 cover-crop (square, centered). Matches the Avatar
//   component at src/components/ui/avatar.tsx.
// - item:   max 1200px long edge, aspect preserved. Larger renders are the
//   exception; @unpic/react handles responsive sizing client-side.
export async function processImage(input: Buffer, preset: ImagePreset): Promise<ProcessedImage> {
	try {
		const pipeline = sharp(input, { failOn: 'error', limitInputPixels: SHARP_PIXEL_LIMIT }).rotate().withMetadata({})

		const shaped =
			preset === 'avatar'
				? pipeline.resize(256, 256, { fit: 'cover', position: 'centre' })
				: pipeline.resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })

		const { data, info } = await shaped.webp({ quality: preset === 'avatar' ? 82 : 80 }).toBuffer({ resolveWithObject: true })

		return {
			buffer: data,
			contentType: 'image/webp',
			extension: 'webp',
			width: info.width,
			height: info.height,
		}
	} catch (error) {
		throw new UploadError('pipeline-failed', 'image processing failed', error)
	}
}
