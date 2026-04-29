import { describe, expect, it } from 'vitest'

import { UploadError } from '../errors'
import { assertImageBytes, detectImageMime } from '../image-pipeline'

// Hand-rolled signature fixtures. We don't ship these as files; we
// just need the first ~12 bytes to be right. Padding the rest with
// zeros is fine since the detector only reads the prefix.
const PAD = Buffer.alloc(32)

function withPad(prefix: Array<number>): Buffer {
	const head = Buffer.from(prefix)
	return Buffer.concat([head, PAD], head.length + PAD.length)
}

const FIXTURES = {
	jpeg: withPad([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
	png: withPad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]),
	gif87a: withPad([0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00]),
	gif89a: withPad([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00]),
	webp: withPad([
		0x52,
		0x49,
		0x46,
		0x46, // RIFF
		0x24,
		0x00,
		0x00,
		0x00, // size
		0x57,
		0x45,
		0x42,
		0x50, // WEBP
	]),
	heic: withPad([
		0x00,
		0x00,
		0x00,
		0x18, // box size
		0x66,
		0x74,
		0x79,
		0x70, // ftyp
		0x68,
		0x65,
		0x69,
		0x63, // heic
	]),
	avif: withPad([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]),
	mif1: withPad([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31]),
}

describe('detectImageMime', () => {
	it.each([
		['jpeg', 'image/jpeg'],
		['png', 'image/png'],
		['gif87a', 'image/gif'],
		['gif89a', 'image/gif'],
		['webp', 'image/webp'],
		['heic', 'image/heic'],
		['avif', 'image/avif'],
		['mif1', 'image/heif'],
	] as const)('%s -> %s', (key, expected) => {
		expect(detectImageMime(FIXTURES[key])).toBe(expected)
	})

	it('returns null for too-short input', () => {
		expect(detectImageMime(Buffer.from([0xff, 0xd8]))).toBeNull()
	})

	it('returns null for plain text', () => {
		expect(detectImageMime(Buffer.from('not an image at all here'))).toBeNull()
	})

	it('returns null for a zip (PK\\x03\\x04)', () => {
		expect(detectImageMime(withPad([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull()
	})

	it('returns null for HTML / SVG', () => {
		expect(detectImageMime(Buffer.from('<svg xmlns="..."><script>x</script></svg>'))).toBeNull()
	})

	it('returns null for an MP4 (ftyp but unknown brand)', () => {
		// ftyp + 'mp42' brand
		expect(detectImageMime(withPad([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]))).toBeNull()
	})
})

describe('assertImageBytes', () => {
	it('returns the detected MIME for a valid image', () => {
		expect(assertImageBytes(FIXTURES.jpeg)).toBe('image/jpeg')
	})

	it('throws UploadError(bad-mime) for unrecognized bytes', () => {
		expect(() => assertImageBytes(Buffer.from('bogus'))).toThrow(UploadError)
		try {
			assertImageBytes(Buffer.from('bogus'))
		} catch (err) {
			expect((err as UploadError).reason).toBe('bad-mime')
		}
	})

	it('throws UploadError(bad-mime) on a polyglot zip', () => {
		expect(() => assertImageBytes(withPad([0x50, 0x4b, 0x03, 0x04]))).toThrow(UploadError)
	})
})
