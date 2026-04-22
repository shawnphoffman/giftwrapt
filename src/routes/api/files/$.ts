import { Readable } from 'node:stream'

import { createFileRoute } from '@tanstack/react-router'

import { createLogger } from '@/lib/logger'
import { getStorage } from '@/lib/storage/adapter'
import { UploadError } from '@/lib/storage/errors'

const log = createLogger('api:files')

// Proxy route that serves storage objects when STORAGE_PUBLIC_URL is unset
// (self-host default). When the env var IS set, getPublicUrl returns
// `${STORAGE_PUBLIC_URL}/<key>` directly and clients never hit this route.
//
// Access control is by key unguessability (10-char nanoid per item,
// 8-char nanoid per avatar). Routes are public for two reasons:
//   1. Images are referenced from emails, which arrive without a session
//      cookie. Gating would break email thumbnails.
//   2. Any authenticated viewer of a list can already see its items
//      including their URLs; the URLs ARE the access control for the bytes.
//
// Caching: keys contain a nonce so each key's bytes are immutable. Clients
// get `Cache-Control: public, max-age=31536000, immutable` plus the S3 ETag
// so even the first re-fetch is a conditional request.
//
// No range support in v1 — these are small webp images, not media. Revisit
// if/when non-image content lands.

export const Route = createFileRoute('/api/files/$')({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				// `$` is TanStack's splat param; it already handles URL-decoding of
				// each path segment, so `items/42/abc.webp` arrives intact.
				const key = params._splat ?? ''
				if (!key) {
					return new Response('missing key', { status: 400 })
				}

				const storage = getStorage()
				let obj
				try {
					obj = await storage.stream(key)
				} catch (error) {
					if (error instanceof UploadError && error.reason === 'not-found') {
						return new Response('not found', { status: 404 })
					}
					log.error({ err: error, key }, 'files.proxy.upstream')
					return new Response('upstream error', { status: 502 })
				}

				// Conditional GET. The storage ETag includes surrounding quotes
				// (S3 convention); echo back as-is so clients matching the previous
				// response header hit 304 without a re-download.
				const ifNoneMatch = request.headers.get('if-none-match')
				if (ifNoneMatch && obj.etag && ifNoneMatch === obj.etag) {
					return new Response(null, {
						status: 304,
						headers: {
							ETag: obj.etag,
							'Cache-Control': 'public, max-age=31536000, immutable',
						},
					})
				}

				const webStream = Readable.toWeb(obj.body) as unknown as ReadableStream<Uint8Array>
				return new Response(webStream, {
					status: 200,
					headers: {
						'Content-Type': obj.contentType,
						'Content-Length': String(obj.contentLength),
						'Cache-Control': 'public, max-age=31536000, immutable',
						...(obj.etag ? { ETag: obj.etag } : {}),
					},
				})
			},
		},
	},
})
