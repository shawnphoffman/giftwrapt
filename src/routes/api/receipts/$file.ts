import { Readable } from 'node:stream'

import { createFileRoute } from '@tanstack/react-router'

import { loadReceiptForViewerImpl } from '@/api/_receipts-impl'
import { auth } from '@/lib/auth'
import { createLogger } from '@/lib/logger'
import { fileProxyLimiter } from '@/lib/rate-limits'
import { parseReceiptUrl } from '@/lib/receipts'
import { getStorage } from '@/lib/storage/adapter'
import { UploadError } from '@/lib/storage/errors'

const log = createLogger('api:receipts')

// Serves receipt attachments (`/api/receipts/<id>.<ext>`) to the gifter's
// unit only. Unlike `/api/files`, this route requires a session and checks the
// viewer against the purchase (loadReceiptForViewerImpl); the storage key is
// looked up server-side and never appears in a URL. Missing, not-allowed, and
// malformed ids all answer 404 so receipt ids cannot be probed.

export const Route = createFileRoute('/api/receipts/$file')({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const session = await auth.api.getSession({ headers: request.headers })
				if (!session?.user.id) return new Response('Unauthorized', { status: 401 })

				const rate = fileProxyLimiter.consume(`receipts:${session.user.id}`)
				if (!rate.allowed) {
					return new Response('Too Many Requests', {
						status: 429,
						headers: { 'retry-after': String(Math.ceil(rate.retryAfterMs / 1000)) },
					})
				}

				const parsed = parseReceiptUrl(`/api/receipts/${params.file}`)
				if (!parsed) return new Response('Not found', { status: 404 })
				const receipt = await loadReceiptForViewerImpl(session.user.id, parsed.id)
				if (!receipt) return new Response('Not found', { status: 404 })

				const storage = getStorage()
				if (!storage) return new Response('storage is not configured on this server', { status: 503 })

				let obj
				try {
					obj = await storage.stream(receipt.storageKey)
				} catch (error) {
					if (error instanceof UploadError && error.reason === 'not-found') return new Response('Not found', { status: 404 })
					log.error({ err: error }, 'receipts.upstream')
					return new Response('upstream error', { status: 502 })
				}

				const webStream = Readable.toWeb(obj.body) as unknown as ReadableStream<Uint8Array>
				return new Response(webStream, {
					status: 200,
					headers: {
						'Content-Type': receipt.contentType,
						'Content-Length': String(obj.contentLength),
						// Private to this browser; a shared cache must never hold a receipt.
						'Cache-Control': 'private, max-age=300',
						'Content-Disposition': 'inline',
						'X-Content-Type-Options': 'nosniff',
					},
				})
			},
		},
	},
})
