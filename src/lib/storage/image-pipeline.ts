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

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif'])

export function assertAllowedMime(mime: string): void {
	if (!ALLOWED_MIME.has(mime.toLowerCase())) {
		throw new UploadError('bad-mime', `unsupported image type: ${mime}`)
	}
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
		const pipeline = sharp(input, { failOn: 'error' }).rotate().withMetadata({})

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
