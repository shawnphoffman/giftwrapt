import { createFileRoute } from '@tanstack/react-router'

import { env } from '@/env'
import { auth } from '@/lib/auth'
import { createLogger } from '@/lib/logger'
import { rateLimitKeyForRequest } from '@/lib/rate-limit'
import { scrapeLimiter } from '@/lib/rate-limits'
import { extractFromPhoto } from '@/lib/scrapers/photo-extract'
import { ScrapeProviderError } from '@/lib/scrapers/types'
import { UploadError } from '@/lib/storage/errors'
import { assertImageBytes } from '@/lib/storage/image-pipeline'

const log = createLogger('api:scrape:photo')

const MAX_BYTES = env.STORAGE_MAX_UPLOAD_MB * 1024 * 1024

// POST endpoint that runs a single-shot vision extraction against the
// configured AI model. Same per-user rate limiter as the URL scrape so
// the cost ceiling stays one paid LLM call per token.
//
// Returns JSON (not SSE) — there's only one provider in this flow and
// no tiered fallbacks to stream.
export const Route = createFileRoute('/api/scrape/photo')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers })
				if (!session?.user.id) {
					return new Response(JSON.stringify({ error: 'unauthorized' }), {
						status: 401,
						headers: { 'content-type': 'application/json' },
					})
				}

				const rateKey = rateLimitKeyForRequest(request, session.user.id)
				const rateResult = scrapeLimiter.consume(rateKey)
				if (!rateResult.allowed) {
					return new Response(JSON.stringify({ error: 'rate-limited' }), {
						status: 429,
						headers: {
							'content-type': 'application/json',
							'retry-after': String(Math.ceil(rateResult.retryAfterMs / 1000)),
						},
					})
				}

				let form: FormData
				try {
					form = await request.formData()
				} catch {
					return jsonError(400, 'invalid-input', 'expected multipart/form-data')
				}
				const file = form.get('file')
				if (!(file instanceof File)) return jsonError(400, 'invalid-input', 'missing "file" field')
				if (file.size === 0) return jsonError(400, 'invalid-input', 'file is empty')
				if (file.size > MAX_BYTES) {
					return jsonError(413, 'too-large', `file exceeds ${env.STORAGE_MAX_UPLOAD_MB} MB limit`)
				}

				let bytes: Uint8Array
				let mediaType: string
				try {
					const ab = await file.arrayBuffer()
					bytes = new Uint8Array(ab)
					// Magic-byte sniff. Refuses non-image polyglots that lie about
					// their `file.type`. See `assertImageBytes` for the supported
					// formats; returns the detected mime so we don't trust the
					// client-supplied one.
					const detected = assertImageBytes(Buffer.from(bytes))
					mediaType = detected
				} catch (err) {
					if (err instanceof UploadError) return jsonError(400, err.reason, err.message)
					return jsonError(400, 'invalid-input', err instanceof Error ? err.message : 'invalid image')
				}

				try {
					const { result, ms } = await extractFromPhoto({
						bytes,
						mediaType,
						signal: request.signal,
					})
					return new Response(JSON.stringify({ result, ms }), {
						status: 200,
						headers: { 'content-type': 'application/json' },
					})
				} catch (err) {
					if (err instanceof ScrapeProviderError) {
						const status = err.code === 'config_missing' ? 503 : err.code === 'timeout' ? 504 : 502
						return jsonError(status, err.code, err.message)
					}
					log.error({ err }, 'photo extract failed unexpectedly')
					return jsonError(500, 'unknown', err instanceof Error ? err.message : 'unknown error')
				}
			},
		},
	},
})

function jsonError(status: number, reason: string, message?: string): Response {
	return new Response(JSON.stringify({ error: reason, message }), {
		status,
		headers: { 'content-type': 'application/json' },
	})
}
